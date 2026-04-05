import { useState, useRef, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, IconButton,
  CircularProgress, Stack, Select, MenuItem, FormControl
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import ReactMarkdown from 'react-markdown';
import { SystemPromptDialog } from './SystemPromptDialog';
import type { ChatMessage, ChatModel } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';

interface ChatSidebarProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  loading: boolean;
  onClose: () => void;
  models: ChatModel[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function ChatSidebar({ messages, onSendMessage, loading, onClose, models, selectedModel, onModelChange }: ChatSidebarProps) {
  const [input, setInput] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { isSupported, isListening, isSpeaking, isMuted, startListening, stopListening, speak, toggleMute, stopSpeaking } = useVoice();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-read last assistant message
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      speak(last.content);
    }
  }, [messages]); // speak is stable (useCallback), safe to omit from deps

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    stopSpeaking();
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
        width: { xs: '100%', md: 420 },
        minWidth: { xs: 0, md: 320 },
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: { xs: '60vh', md: 'calc(100vh - 180px)' },
        position: { xs: 'static', md: 'sticky' },
        top: { md: 80 },
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight="bold">Diet Assistant</Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          {models.length > 0 && (
            <FormControl size="small">
              <Select
                value={selectedModel}
                onChange={e => onModelChange(e.target.value)}
                variant="standard"
                disableUnderline
                sx={{ fontSize: 11, color: 'text.secondary', minWidth: 80 }}
              >
                {models.map(m => (
                  <MenuItem key={m.id} value={m.id} sx={{ fontSize: 12 }}>
                    {m.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <IconButton size="small" onClick={() => setShowPrompt(true)} aria-label="view system prompt" title="View system prompt">
            <InfoIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={toggleMute}
            aria-label={isMuted ? 'unmute assistant voice' : 'mute assistant voice'}
            title={isMuted ? 'Unmute voice' : 'Mute voice'}
            sx={{ color: isSpeaking && !isMuted ? 'primary.main' : 'inherit' }}
          >
            {isMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={onClose} aria-label="close chat">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
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
            {msg.role === 'user' ? (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </Typography>
            ) : (
              <Box
                sx={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  '& p': { m: 0, mb: 0.5 },
                  '& p:last-child': { mb: 0 },
                  '& ul, & ol': { mt: 0.5, mb: 0.5, pl: 2.5 },
                  '& li': { mb: 0.25 },
                  '& strong': { fontWeight: 600 },
                  '& code': { fontFamily: 'monospace', fontSize: 12, bgcolor: 'grey.200', px: 0.5, borderRadius: 0.5 },
                }}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </Box>
            )}
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
        {isSupported && (
          <IconButton
            onClick={isListening ? stopListening : () => startListening(setInput)}
            aria-label={isListening ? 'stop listening' : 'start voice input'}
            title={isListening ? 'Stop listening' : 'Speak a message'}
            sx={{
              color: isListening ? 'error.main' : 'inherit',
              animation: isListening ? 'pulse 1s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.4 },
                '100%': { opacity: 1 },
              },
            }}
          >
            {isListening ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
        )}
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="send message"
        >
          <SendIcon />
        </IconButton>
      </Stack>
      <SystemPromptDialog open={showPrompt} onClose={() => setShowPrompt(false)} />
    </Paper>
  );
}
