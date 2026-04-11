import { useState, useEffect, useCallback } from 'react';

export interface DayNote {
  text: string;
  createdAt: string;
}

export function useNotes(date: string) {
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
        setNotes(data.notes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = useCallback(async (text: string) => {
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
  }, [date]);

  const deleteNote = useCallback(async (createdAt: string) => {
    try {
      const res = await fetch('/api/notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, createdAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch {}
  }, [date]);

  return { notes, loading, saving, addNote, deleteNote };
}
