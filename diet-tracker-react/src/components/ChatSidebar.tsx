import { useState, useRef, useEffect, Fragment } from 'react';
import {
  Box, Paper, Typography, TextField, IconButton,
  CircularProgress, Stack, Select, MenuItem, FormControl,
  useMediaQuery, useTheme, Fab, Zoom, Slide,
  ToggleButtonGroup, ToggleButton, Button
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import ChatIcon from '@mui/icons-material/Chat';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReactMarkdown from 'react-markdown';
import { SystemPromptDialog } from './SystemPromptDialog';
import type { ChatMessage, ChatModel } from '../hooks/useChat';
import { useNotes } from '../hooks/useNotes';

interface ChatSidebarProps {
  open: boolean;
  date: string;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onRetry?: () => void;
  loading: boolean;
  onClose: () => void;
  onToggle: () => void;
  models: ChatModel[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  fullPage?: boolean;
  externalTab?: 'chat' | 'notes';
}

export function ChatSidebar({ open, date, messages, onSendMessage, onRetry, loading, onClose, onToggle, models, selectedModel, onModelChange, fullPage, externalTab }: ChatSidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [input, setInput] = useState('');
  const [tabInternal, setTabInternal] = useState<'chat' | 'notes'>('chat');
  const tab = externalTab !== undefined ? externalTab : tabInternal;
  const setTab = (v: 'chat' | 'notes') => { if (externalTab === undefined) setTabInternal(v); };
  const [noteInput, setNoteInput] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { notes, saving: notesSaving, addNote, deleteNote } = useNotes(date);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, open]);

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

  const handleAddNote = async () => {
    const trimmed = noteInput.trim();
    if (!trimmed || notesSaving) return;
    await addNote(trimmed);
    setNoteInput('');
  };

  const chatPanelContent = (
    <>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <ToggleButtonGroup
          value={tab}
          exclusive
          onChange={(_, v) => v && setTab(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.25, fontSize: 12, textTransform: 'none', border: 'none', borderRadius: '6px !important' } }}
        >
          <ToggleButton value="chat">Chat</ToggleButton>
          <ToggleButton value="notes">
            Notes
            {notes.length > 0 && (
              <Box
                component="span"
                sx={{
                  ml: 0.75, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%', bgcolor: 'primary.main',
                  color: 'white', fontSize: 10, fontWeight: 700,
                }}
              >
                {notes.length}
              </Box>
            )}
          </ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          {tab === 'chat' && models.length > 0 && (
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
          {tab === 'chat' && (
            <IconButton size="small" onClick={() => setShowPrompt(true)} aria-label="view system prompt" title="View system prompt">
              <InfoIcon fontSize="small" />
            </IconButton>
          )}
          {!fullPage && (
            <IconButton size="small" onClick={onClose} aria-label="close chat">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Chat tab */}
      {tab === 'chat' && (
        <>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {messages.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                Ask me to log entries, check remaining intake, or suggest recipes.
              </Typography>
            )}
            {messages.map((msg, i) => (
              <Fragment key={i}>
                <Box
                  sx={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                    color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    px: 1.5,
                    py: 1,
                    borderRadius: '8px',
                  }}
                >
                  {msg.role === 'user' ? (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>
                  ) : (
                    <Box
                      sx={{
                        fontSize: 14, lineHeight: 1.5,
                        '& p': { m: 0, mb: 0.5 }, '& p:last-child': { mb: 0 },
                        '& ul, & ol': { mt: 0.5, mb: 0.5, pl: 2.5 }, '& li': { mb: 0.25 },
                        '& strong': { fontWeight: 600 },
                        '& code': { fontFamily: 'monospace', fontSize: 12, bgcolor: 'grey.200', px: 0.5, borderRadius: 0.5 },
                      }}
                    >
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </Box>
                  )}
                </Box>
                {msg.isError && i === messages.length - 1 && onRetry && (
                  <Box sx={{ alignSelf: 'flex-start' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                      onClick={onRetry}
                      disabled={loading}
                      sx={{ fontSize: 12, py: 0.5, px: 1.25, borderRadius: '6px' }}
                    >
                      Retry
                    </Button>
                  </Box>
                )}
              </Fragment>
            ))}
            {loading && (
              <Box sx={{ alignSelf: 'flex-start', pl: 1 }}>
                <CircularProgress size={16} />
              </Box>
            )}
            <div ref={bottomRef} />
          </Box>

          <Stack direction="row" spacing={0.5} sx={{ p: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
            <TextField
              size="small" fullWidth
              placeholder="Type a message..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              multiline maxRows={3}
            />
            <IconButton color="primary" onClick={handleSend} disabled={!input.trim() || loading} aria-label="send message">
              <SendIcon />
            </IconButton>
          </Stack>
        </>
      )}

      {/* Notes tab */}
      {tab === 'notes' && (
        <>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {notes.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                No notes for this day yet. Add observations about sickness, ketones, vomiting, etc.
              </Typography>
            )}
            {notes.map((note, i) => (
              <Box
                key={i}
                sx={{
                  p: 1.5,
                  bgcolor: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderLeft: '3px solid #f59e0b',
                  borderRadius: 1.5,
                  position: 'relative',
                }}
              >
                <Typography variant="body2" sx={{ pr: 3, whiteSpace: 'pre-wrap' }}>{note.text}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                  {new Date(note.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => deleteNote(note.createdAt)}
                  sx={{ position: 'absolute', top: 4, right: 4, opacity: 0.5, '&:hover': { opacity: 1 } }}
                  aria-label="delete note"
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
          </Box>

          <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
            <TextField
              size="small" fullWidth multiline maxRows={4}
              placeholder="e.g. Ketones 3.2, mild fever in evening..."
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
              sx={{ mb: 1 }}
            />
            <Button
              variant="contained" fullWidth size="small"
              startIcon={notesSaving ? <CircularProgress size={14} color="inherit" /> : <NoteAddIcon />}
              onClick={handleAddNote}
              disabled={!noteInput.trim() || notesSaving}
            >
              Add Note
            </Button>
          </Box>
        </>
      )}

      <SystemPromptDialog open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );

  // ── Full-page mode (Chat/Notes as top-level tabs) ──
  if (fullPage) {
    return (
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {chatPanelContent}
      </Paper>
    );
  }

  // ── Mobile: floating FAB + popup ──
  if (isMobile) {
    return (
      <>
        {/* Floating chat popup */}
        <Slide direction="up" in={open} mountOnEnter unmountOnExit>
          <Paper
            elevation={8}
            sx={{
              position: 'fixed',
              bottom: 88,
              right: 16,
              width: 'min(360px, calc(100vw - 32px))',
              height: '65vh',
              maxHeight: 520,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1300,
              borderRadius: 3,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            {chatPanelContent}
          </Paper>
        </Slide>

        {/* FAB toggle button */}
        <Zoom in>
          <Fab
            onClick={onToggle}
            aria-label="toggle chat"
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1300,
              background: open
                ? 'linear-gradient(135deg, #0d6b4f 0%, #1B8A6B 100%)'
                : 'linear-gradient(135deg, #1B8A6B 0%, #2db882 100%)',
              color: 'white',
              boxShadow: '0 4px 16px rgba(27,138,107,0.45)',
              '&:hover': {
                background: 'linear-gradient(135deg, #0d6b4f 0%, #1B8A6B 100%)',
              },
            }}
          >
            {open ? <CloseIcon /> : <ChatIcon />}
          </Fab>
        </Zoom>
      </>
    );
  }

  // ── Desktop: sticky sidebar ──
  if (!open) return null;

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
      {chatPanelContent}
    </Paper>
  );
}
