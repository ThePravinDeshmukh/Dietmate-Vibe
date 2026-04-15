import { useState, useCallback, useEffect, useRef } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

export interface ChatModel {
  id: string;
  displayName: string;
}

export function useChat(date: string, onResponse?: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-lite-latest');
  const autoGreetedDateRef = useRef<string>('');
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    fetch('/api/chat/models')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.models?.length) {
          setModels(data.models);
          // Keep default if it exists in the list, otherwise pick first
          setSelectedModel(prev =>
            data.models.find((m: ChatModel) => m.id === prev) ? prev : data.models[0].id
          );
        }
      })
      .catch(() => {});
  }, []);

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
        body: JSON.stringify({ message: content, date, model: selectedModel })
      });

      if (!res.ok) throw new Error('Assistant unavailable');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      onResponse?.();
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm unavailable right now. Please try again.", isError: true }
      ]);
    } finally {
      setLoading(false);
    }
  }, [date, selectedModel, onResponse]);

  const retryLastMessage = useCallback(async () => {
    const msgs = messagesRef.current;
    let lastUserMsgIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserMsgIdx = i;
        break;
      }
    }
    if (lastUserMsgIdx === -1) return;
    const content = msgs[lastUserMsgIdx].content;
    setMessages(prev => prev.slice(0, lastUserMsgIdx));
    await sendMessage(content);
  }, [sendMessage]);

  useEffect(() => {
    if (!date || autoGreetedDateRef.current === date) return;
    autoGreetedDateRef.current = date;
    sendMessage("What's remaining in my diet today?");
  }, [date, sendMessage]);

  return { messages, sendMessage, retryLastMessage, loading, models, selectedModel, setSelectedModel };
}
