import { useState, useEffect, useCallback } from 'react';

export type KetoneLevel = 'trace' | 'small' | 'moderate' | 'large';

export interface KetoneEntry { level: KetoneLevel; createdAt: string; pending?: true; }
export interface UrineEvent { createdAt: string; label?: string; pending?: true; }
export interface LiquidEntry { ml: number; createdAt: string; pending?: true; }

interface PendingQueue {
  ketones: Array<{ level: KetoneLevel; createdAt: string }>;
  urine: Array<{ createdAt: string }>;
  liquid: Array<{ ml: number; createdAt: string }>;
}

function queueKey(date: string) { return `pending_health_${date}`; }

function loadQueue(date: string): PendingQueue {
  try {
    const raw = localStorage.getItem(queueKey(date));
    return raw ? JSON.parse(raw) : { ketones: [], urine: [], liquid: [] };
  } catch { return { ketones: [], urine: [], liquid: [] }; }
}

function saveQueue(date: string, q: PendingQueue) {
  if (!q.ketones.length && !q.urine.length && !q.liquid.length) {
    localStorage.removeItem(queueKey(date));
  } else {
    localStorage.setItem(queueKey(date), JSON.stringify(q));
  }
}

function withPending(date: string, serverK: KetoneEntry[], serverU: UrineEvent[], serverL: LiquidEntry[]): [KetoneEntry[], UrineEvent[], LiquidEntry[]] {
  const q = loadQueue(date);
  return [
    [...q.ketones.map(k => ({ ...k, pending: true as const })), ...serverK],
    [...q.urine.map(u => ({ ...u, pending: true as const })), ...serverU],
    [...q.liquid.map(l => ({ ...l, pending: true as const })), ...serverL],
  ];
}

export function useHealthTracking(date: string, connectionStatus?: 'online' | 'offline') {
  const [ketones, setKetones] = useState<KetoneEntry[]>([]);
  const [urineEvents, setUrineEvents] = useState<UrineEvent[]>([]);
  const [liquidIntake, setLiquidIntake] = useState<LiquidEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/health-tracking?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        const [k, u, l] = withPending(date, data.ketones || [], data.urineEvents || [], data.liquidIntake || []);
        setKetones(k); setUrineEvents(u); setLiquidIntake(l);
      }
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Flush pending queue when back online
  useEffect(() => {
    if (connectionStatus !== 'online') return;
    const q = loadQueue(date);
    if (!q.ketones.length && !q.urine.length && !q.liquid.length) return;
    (async () => {
      for (const k of [...q.ketones]) {
        try {
          const res = await fetch('/api/health-tracking/ketone', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, level: k.level }),
          });
          if (res.ok) {
            const nq = loadQueue(date);
            nq.ketones = nq.ketones.filter(x => x.createdAt !== k.createdAt);
            saveQueue(date, nq);
          }
        } catch { /* skip */ }
      }
      for (const u of [...q.urine]) {
        try {
          const res = await fetch('/api/health-tracking/urine', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date }),
          });
          if (res.ok) {
            const nq = loadQueue(date);
            nq.urine = nq.urine.filter(x => x.createdAt !== u.createdAt);
            saveQueue(date, nq);
          }
        } catch { /* skip */ }
      }
      for (const l of [...q.liquid]) {
        try {
          const res = await fetch('/api/health-tracking/liquid', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, ml: l.ml }),
          });
          if (res.ok) {
            const nq = loadQueue(date);
            nq.liquid = nq.liquid.filter(x => x.createdAt !== l.createdAt);
            saveQueue(date, nq);
          }
        } catch { /* skip */ }
      }
      fetchAll();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, date]);

  // --- Add operations: instant local update, offline-queue when disconnected ---

  const addKetone = useCallback(async (level: KetoneLevel) => {
    const entry: KetoneEntry = { level, createdAt: new Date().toISOString() };
    if (connectionStatus === 'offline') {
      const q = loadQueue(date);
      q.ketones.push(entry);
      saveQueue(date, q);
      setKetones(prev => [{ ...entry, pending: true }, ...prev]);
      return;
    }
    setKetones(prev => [entry, ...prev]); // optimistic
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/ketone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, level }),
      });
      if (res.ok) {
        const data = await res.json();
        const [k] = withPending(date, data.ketones || [], [], []);
        setKetones(k);
      }
    } catch { /* keep optimistic */ } finally { setSaving(false); }
  }, [date, connectionStatus]);

  const addUrine = useCallback(async () => {
    const entry: UrineEvent = { createdAt: new Date().toISOString() };
    if (connectionStatus === 'offline') {
      const q = loadQueue(date);
      q.urine.push(entry);
      saveQueue(date, q);
      setUrineEvents(prev => [{ ...entry, pending: true }, ...prev]);
      return;
    }
    setUrineEvents(prev => [entry, ...prev]); // optimistic
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/urine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        const data = await res.json();
        const [, u] = withPending(date, [], data.urineEvents || [], []);
        setUrineEvents(u);
      }
    } catch { /* keep optimistic */ } finally { setSaving(false); }
  }, [date, connectionStatus]);

  const addLiquid = useCallback(async (ml: number) => {
    const entry: LiquidEntry = { ml, createdAt: new Date().toISOString() };
    if (connectionStatus === 'offline') {
      const q = loadQueue(date);
      q.liquid.push(entry);
      saveQueue(date, q);
      setLiquidIntake(prev => [{ ...entry, pending: true }, ...prev]);
      return;
    }
    setLiquidIntake(prev => [entry, ...prev]); // optimistic
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/liquid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ml }),
      });
      if (res.ok) {
        const data = await res.json();
        const [, , l] = withPending(date, [], [], data.liquidIntake || []);
        setLiquidIntake(l);
      }
    } catch { /* keep optimistic */ } finally { setSaving(false); }
  }, [date, connectionStatus]);

  // --- Delete operations: instant local removal, skip API for pending entries ---

  const deleteKetone = useCallback(async (createdAt: string) => {
    const q = loadQueue(date);
    if (q.ketones.some(x => x.createdAt === createdAt)) {
      q.ketones = q.ketones.filter(x => x.createdAt !== createdAt);
      saveQueue(date, q);
      setKetones(prev => prev.filter(k => k.createdAt !== createdAt));
      return;
    }
    setKetones(prev => prev.filter(k => k.createdAt !== createdAt)); // optimistic
    try {
      const res = await fetch('/api/health-tracking/ketone', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        const [k] = withPending(date, data.ketones || [], [], []);
        setKetones(k);
      }
    } catch { /* keep optimistic */ }
  }, [date]);

  const deleteUrine = useCallback(async (createdAt: string) => {
    const q = loadQueue(date);
    if (q.urine.some(x => x.createdAt === createdAt)) {
      q.urine = q.urine.filter(x => x.createdAt !== createdAt);
      saveQueue(date, q);
      setUrineEvents(prev => prev.filter(u => u.createdAt !== createdAt));
      return;
    }
    setUrineEvents(prev => prev.filter(u => u.createdAt !== createdAt)); // optimistic
    try {
      const res = await fetch('/api/health-tracking/urine', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        const [, u] = withPending(date, [], data.urineEvents || [], []);
        setUrineEvents(u);
      }
    } catch { /* keep optimistic */ }
  }, [date]);

  const deleteLiquid = useCallback(async (createdAt: string) => {
    const q = loadQueue(date);
    if (q.liquid.some(x => x.createdAt === createdAt)) {
      q.liquid = q.liquid.filter(x => x.createdAt !== createdAt);
      saveQueue(date, q);
      setLiquidIntake(prev => prev.filter(l => l.createdAt !== createdAt));
      return;
    }
    setLiquidIntake(prev => prev.filter(l => l.createdAt !== createdAt)); // optimistic
    try {
      const res = await fetch('/api/health-tracking/liquid', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        const [, , l] = withPending(date, [], [], data.liquidIntake || []);
        setLiquidIntake(l);
      }
    } catch { /* keep optimistic */ }
  }, [date]);

  // --- Update operations: instant local update, then confirm from server ---

  const updateKetone = useCallback(async (createdAt: string, level?: KetoneLevel, newTime?: string) => {
    setKetones(prev => prev.map(k => k.createdAt === createdAt ? {
      ...k, ...(level ? { level } : {}), ...(newTime ? { createdAt: newTime } : {}),
    } : k));
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/ketone', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt, level, newTime }),
      });
      if (res.ok) {
        const data = await res.json();
        const [k] = withPending(date, data.ketones || [], [], []);
        setKetones(k);
      }
    } finally { setSaving(false); }
  }, [date]);

  const updateUrine = useCallback(async (createdAt: string, label?: string, newTime?: string) => {
    setUrineEvents(prev => prev.map(u => u.createdAt === createdAt ? {
      ...u, ...(label !== undefined ? { label } : {}), ...(newTime ? { createdAt: newTime } : {}),
    } : u));
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/urine', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt, label, newTime }),
      });
      if (res.ok) {
        const data = await res.json();
        const [, u] = withPending(date, [], data.urineEvents || [], []);
        setUrineEvents(u);
      }
    } finally { setSaving(false); }
  }, [date]);

  const updateLiquid = useCallback(async (createdAt: string, ml?: number, newTime?: string) => {
    setLiquidIntake(prev => prev.map(l => l.createdAt === createdAt ? {
      ...l, ...(ml !== undefined ? { ml } : {}), ...(newTime ? { createdAt: newTime } : {}),
    } : l));
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/liquid', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt, ml, newTime }),
      });
      if (res.ok) {
        const data = await res.json();
        const [, , l] = withPending(date, [], [], data.liquidIntake || []);
        setLiquidIntake(l);
      }
    } finally { setSaving(false); }
  }, [date]);

  return { ketones, urineEvents, liquidIntake, loading, saving, addKetone, deleteKetone, addUrine, deleteUrine, addLiquid, deleteLiquid, updateKetone, updateUrine, updateLiquid };
}
