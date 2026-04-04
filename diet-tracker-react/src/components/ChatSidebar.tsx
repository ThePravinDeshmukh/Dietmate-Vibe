import { useState, useRef, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, IconButton,
  CircularProgress, Stack
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import type { ChatMessage } from '../hooks/useChat';

interface ChatSidebarProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  loading: boolean;
  onClose: () => void;
}

export function ChatSidebar({ messages, onSendMessage, loading, onClose }: ChatSidebarProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        width: 320,
        minWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: 'calc(100vh - 180px)',
        position: 'sticky',
        top: 80,
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight="bold">Diet Assistant</Typography>
        <IconButton size="small" onClick={onClose} aria-label="close chat">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* Message list */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            Ask me to log entries, check remaining intake, or suggest recipes.
          </Typography>
        )}
        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
              color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
              px: 1.5,
              py: 1,
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </Typography>
          </Box>
        ))}
        {loading && (
          <Box sx={{ alignSelf: 'flex-start', pl: 1 }}>
            <CircularProgress size={16} />
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          multiline
          maxRows={3}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="send message"
        >
          <SendIcon />
        </IconButton>
      </Stack>
    </Paper>
  );
}
