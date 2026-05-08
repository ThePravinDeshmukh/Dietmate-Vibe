import { useState, useEffect, useCallback } from 'react';

export type KetoneLevel = 'trace' | 'small' | 'moderate' | 'large';

export interface KetoneEntry {
  level: KetoneLevel;
  createdAt: string;
}

export interface UrineEvent {
  createdAt: string;
  label?: string;
}

export interface LiquidEntry {
  ml: number;
  createdAt: string;
}

export function useHealthTracking(date: string) {
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
        setKetones(data.ketones || []);
        setUrineEvents(data.urineEvents || []);
        setLiquidIntake(data.liquidIntake || []);
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addKetone = useCallback(async (level: KetoneLevel) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/ketone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, level }),
      });
      if (res.ok) {
        const data = await res.json();
        setKetones(data.ketones || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const deleteKetone = useCallback(async (createdAt: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/ketone', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setKetones(data.ketones || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const addUrine = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/urine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        const data = await res.json();
        setUrineEvents(data.urineEvents || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const deleteUrine = useCallback(async (createdAt: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/urine', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setUrineEvents(data.urineEvents || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const addLiquid = useCallback(async (ml: number) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/liquid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ml }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiquidIntake(data.liquidIntake || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const deleteLiquid = useCallback(async (createdAt: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/liquid', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiquidIntake(data.liquidIntake || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const updateKetone = useCallback(async (createdAt: string, level?: KetoneLevel, newTime?: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/ketone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt, level, newTime }),
      });
      if (res.ok) {
        const data = await res.json();
        setKetones(data.ketones || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const updateUrine = useCallback(async (createdAt: string, label?: string, newTime?: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/urine', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt, label, newTime }),
      });
      if (res.ok) {
        const data = await res.json();
        setUrineEvents(data.urineEvents || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  const updateLiquid = useCallback(async (createdAt: string, ml?: number, newTime?: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/health-tracking/liquid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt, ml, newTime }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiquidIntake(data.liquidIntake || []);
      }
    } finally { setSaving(false); }
  }, [date]);

  return { ketones, urineEvents, liquidIntake, loading, saving, addKetone, deleteKetone, addUrine, deleteUrine, addLiquid, deleteLiquid, updateKetone, updateUrine, updateLiquid };
}
