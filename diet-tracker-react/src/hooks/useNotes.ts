import { useState, useEffect, useCallback } from 'react';

export interface DayNote {
  text: string;
  createdAt: string;
  pending?: true;
}

function pendingKey(date: string) {
  return `pending_notes_${date}`;
}

function loadPending(date: string): DayNote[] {
  try {
    const raw = localStorage.getItem(pendingKey(date));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePending(date: string, notes: DayNote[]) {
  localStorage.setItem(pendingKey(date), JSON.stringify(notes));
}

function removePendingNote(date: string, createdAt: string) {
  const remaining = loadPending(date).filter(n => n.createdAt !== createdAt);
  if (remaining.length === 0) {
    localStorage.removeItem(pendingKey(date));
  } else {
    savePending(date, remaining);
  }
}

export function useNotes(date: string, connectionStatus?: 'online' | 'offline') {
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        const serverNotes: DayNote[] = data.notes || [];
        const pending = loadPending(date);
        // Merge: pending notes not yet on server go at top
        const merged = [
          ...pending.map(n => ({ ...n, pending: true as const })),
          ...serverNotes,
        ];
        setNotes(merged);
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Sync pending notes when coming back online
  useEffect(() => {
    if (connectionStatus !== 'online') return;
    const pending = loadPending(date);
    if (pending.length === 0) return;
    (async () => {
      for (const note of pending) {
        try {
          const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, text: note.text }),
          });
          if (res.ok) {
            removePendingNote(date, note.createdAt);
          }
        } catch (e) { /* network error — try next */ void e; }
      }
      fetchNotes();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, date]);

  const addNote = useCallback(async (text: string) => {
    if (connectionStatus === 'offline') {
      const note: DayNote = { text, createdAt: new Date().toISOString(), pending: true };
      const pending = loadPending(date);
      savePending(date, [...pending, note]);
      setNotes(prev => [note, ...prev]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, text }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } finally {
      setSaving(false);
    }
  }, [date, connectionStatus]);

  const deleteNote = useCallback(async (createdAt: string) => {
    // If it's a pending note, remove from queue only
    const pending = loadPending(date);
    const isPending = pending.some(n => n.createdAt === createdAt);
    if (isPending) {
      removePendingNote(date, createdAt);
      setNotes(prev => prev.filter(n => n.createdAt !== createdAt));
      return;
    }
    try {
      const res = await fetch('/api/notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        const serverNotes: DayNote[] = data.notes || [];
        const stillPending = loadPending(date);
        setNotes([
          ...stillPending.map(n => ({ ...n, pending: true as const })),
          ...serverNotes,
        ]);
      }
    } catch (e) { void e; }
  }, [date]);

  return { notes, loading, saving, addNote, deleteNote };
}
