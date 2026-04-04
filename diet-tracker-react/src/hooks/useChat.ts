import { useState, useCallback, useEffect } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useChat(date: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMessages([]);
  }, [date]);

  const sendMessage = useCallback(async (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, date })
      });

      if (!res.ok) throw new Error('Assistant unavailable');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm unavailable right now. Please try again." }
      ]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  return { messages, sendMessage, loading };
}
