import { useState, useRef, useEffect, Fragment } from 'react';
import {
  Box, Paper, Typography, TextField, IconButton,
  CircularProgress, Stack, Select, MenuItem, FormControl,
  useMediaQuery, useTheme, Fab, Zoom, Slide, Button,
  ToggleButton, ToggleButtonGroup, Divider
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import ChatIcon from '@mui/icons-material/Chat';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import EditIcon from '@mui/icons-material/Edit';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SystemPromptDialog } from './SystemPromptDialog';
import type { ChatMessage, ChatModel } from '../hooks/useChat';
import { useNotes } from '../hooks/useNotes';
import { useHealthTracking } from '../hooks/useHealthTracking';
import type { KetoneLevel } from '../hooks/useHealthTracking';

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
  connectionStatus?: 'online' | 'offline';
}

type EditingKey = { type: 'ketone' | 'urine' | 'liquid'; createdAt: string } | null;

function toTimeInput(isoStr: string) {
  const d = new Date(isoStr);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function buildISO(dateStr: string, hhmm: string) {
  return new Date(dateStr + 'T' + hhmm + ':00').toISOString();
}

export function ChatSidebar({ open, date, messages, onSendMessage, onRetry, loading, onClose, onToggle, models, selectedModel, onModelChange, fullPage, externalTab, connectionStatus }: ChatSidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [input, setInput] = useState('');
  const tab = externalTab ?? 'chat';
  const [noteInput, setNoteInput] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { notes, saving: notesSaving, addNote, deleteNote } = useNotes(date, connectionStatus);
  const { ketones, urineEvents, liquidIntake, saving: healthSaving, addKetone, deleteKetone, addUrine, deleteUrine, addLiquid, deleteLiquid, updateKetone, updateUrine, updateLiquid } = useHealthTracking(date, connectionStatus);
  const [selectedKetoneLevel, setSelectedKetoneLevel] = useState<KetoneLevel>('trace');
  const [liquidMl, setLiquidMl] = useState('');

  // Edit state
  const [editingKey, setEditingKey] = useState<EditingKey>(null);
  const [editTime, setEditTime] = useState('');
  const [editLevel, setEditLevel] = useState<KetoneLevel>('trace');
  const [editLabel, setEditLabel] = useState('');
  const [editMl, setEditMl] = useState('');

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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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

  const handleAddKetone = async () => { await addKetone(selectedKetoneLevel); };
  const handleAddUrine = async () => { await addUrine(); };
  const handleAddLiquid = async () => {
    const ml = parseFloat(liquidMl);
    if (!ml || ml <= 0) return;
    await addLiquid(ml);
    setLiquidMl('');
  };

  const openEdit = (type: 'ketone' | 'urine' | 'liquid', createdAt: string, opts: { level?: KetoneLevel; label?: string; ml?: number }) => {
    setEditingKey({ type, createdAt });
    setEditTime(toTimeInput(createdAt));
    if (opts.level) setEditLevel(opts.level);
    if (opts.label !== undefined) setEditLabel(opts.label);
    if (opts.ml !== undefined) setEditMl(String(opts.ml));
  };

  const cancelEdit = () => setEditingKey(null);

  const saveEdit = async () => {
    if (!editingKey) return;
    const newTime = buildISO(date, editTime);
    if (editingKey.type === 'ketone') {
      await updateKetone(editingKey.createdAt, editLevel, newTime);
    } else if (editingKey.type === 'urine') {
      await updateUrine(editingKey.createdAt, editLabel || undefined, newTime);
    } else {
      const ml = parseFloat(editMl);
      if (!ml || ml <= 0) return;
      await updateLiquid(editingKey.createdAt, ml, newTime);
    }
    setEditingKey(null);
  };

  const isEditing = (type: 'ketone' | 'urine' | 'liquid', createdAt: string) =>
    editingKey?.type === type && editingKey.createdAt === createdAt;

  const editRowSx = { px: 1, py: 0.75, borderRadius: 1, border: '1px solid' };

  const chatPanelContent = (
    <>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {tab === 'chat' && models.length > 0 && (
            <FormControl size="small">
              <Select
                value={selectedModel}
                onChange={e => onModelChange(e.target.value)}
                variant="standard"
                disableUnderline
                sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 80 }}
              >
                {models.map(m => (
                  <MenuItem key={m.id} value={m.id} sx={{ fontSize: '0.75rem' }}>
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
                        fontSize: '0.875rem', lineHeight: 1.5,
                        '& p': { margin: 0, marginBottom: '4px' }, '& p:last-child': { marginBottom: 0 },
                        '& ul, & ol': { marginTop: '4px', marginBottom: '4px', paddingLeft: 20 }, '& li': { marginBottom: 2 },
                        '& strong': { fontWeight: 600 },
                        '& code': { fontFamily: 'monospace', fontSize: '0.75rem', backgroundColor: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: 3 },
                        '& table': { borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem', margin: '6px 0', display: 'block', overflowX: 'auto' },
                        '& thead tr': { backgroundColor: 'rgba(0,0,0,0.07)' },
                        '& th': { fontWeight: 600, padding: '5px 10px', border: '1px solid rgba(0,0,0,0.18)', textAlign: 'left', whiteSpace: 'nowrap' },
                        '& td': { padding: '4px 10px', border: '1px solid rgba(0,0,0,0.18)', verticalAlign: 'top' },
                        '& tbody tr:nth-of-type(even)': { backgroundColor: 'rgba(0,0,0,0.025)' },
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
                      sx={{ fontSize: '0.75rem', py: 0.5, px: 1.25, borderRadius: '6px' }}
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
              placeholder="Type a message… Ctrl+Enter to send"
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
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>

            {/* Date header */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </Typography>

            {/* Ketones */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Ketones
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, mb: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={selectedKetoneLevel}
                  onChange={(_, val) => { if (val) setSelectedKetoneLevel(val); }}
                >
                  {(['trace', 'small', 'moderate', 'large'] as KetoneLevel[]).map(lvl => (
                    <ToggleButton key={lvl} value={lvl} sx={{ fontSize: '0.7rem', px: 1, py: 0.5, textTransform: 'none' }}>
                      {lvl}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <IconButton size="small" color="primary" onClick={handleAddKetone} aria-label="add ketone">
                  <AddIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Stack spacing={0.5}>
                {ketones.map((k, i) => (
                  isEditing('ketone', k.createdAt) ? (
                    <Box key={i} sx={{ ...editRowSx, bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                      <Stack spacing={0.75}>
                        <ToggleButtonGroup size="small" exclusive value={editLevel} onChange={(_, val) => { if (val) setEditLevel(val); }}>
                          {(['trace', 'small', 'moderate', 'large'] as KetoneLevel[]).map(lvl => (
                            <ToggleButton key={lvl} value={lvl} sx={{ fontSize: '0.7rem', px: 1, py: 0.5, textTransform: 'none' }}>{lvl}</ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                        <TextField size="small" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} sx={{ width: 130 }} />
                        <Stack direction="row" spacing={0.5}>
                          <Button size="small" variant="contained" onClick={saveEdit} disabled={healthSaving} sx={{ fontSize: '0.7rem', py: 0.25 }}>Save</Button>
                          <Button size="small" variant="outlined" onClick={cancelEdit} sx={{ fontSize: '0.7rem', py: 0.25 }}>Cancel</Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ) : (
                    <Stack key={i} direction="row" alignItems="center" justifyContent="space-between"
                      sx={{ px: 1, py: 0.25, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: k.pending ? '3px solid #86efac' : '1px solid #bbf7d0', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{k.level}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {new Date(k.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {k.pending && ' · pending'}
                      </Typography>
                      <Stack direction="row">
                        <IconButton size="small" onClick={() => openEdit('ketone', k.createdAt, { level: k.level })}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} aria-label="edit ketone">
                          <EditIcon sx={{ fontSize: 13 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => deleteKetone(k.createdAt)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} aria-label="delete ketone">
                          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  )
                ))}
              </Stack>
            </Box>

            {/* Urine */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Urine{urineEvents.length > 0 ? ` (${urineEvents.length}×)` : ''}
              </Typography>
              <Stack direction="row" alignItems="center" sx={{ mt: 0.5, mb: 0.5 }}>
                <Button size="small" variant="outlined" startIcon={<WaterDropIcon sx={{ fontSize: 14 }} />}
                  onClick={handleAddUrine}
                  sx={{ fontSize: '0.75rem', py: 0.5, px: 1.25, borderRadius: '6px', textTransform: 'none' }}>
                  Log
                </Button>
              </Stack>
              <Stack spacing={0.5}>
                {urineEvents.map((u, i) => (
                  isEditing('urine', u.createdAt) ? (
                    <Box key={i} sx={{ ...editRowSx, bgcolor: '#eff6ff', borderColor: '#bfdbfe' }}>
                      <Stack spacing={0.75}>
                        <TextField size="small" placeholder={`event ${i + 1}`} value={editLabel}
                          onChange={e => setEditLabel(e.target.value)} fullWidth
                          label="Label (optional)" inputProps={{ style: { fontSize: '0.8rem' } }} />
                        <TextField size="small" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} sx={{ width: 130 }} />
                        <Stack direction="row" spacing={0.5}>
                          <Button size="small" variant="contained" onClick={saveEdit} disabled={healthSaving} sx={{ fontSize: '0.7rem', py: 0.25 }}>Save</Button>
                          <Button size="small" variant="outlined" onClick={cancelEdit} sx={{ fontSize: '0.7rem', py: 0.25 }}>Cancel</Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ) : (
                    <Stack key={i} direction="row" alignItems="center" justifyContent="space-between"
                      sx={{ px: 1, py: 0.25, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderLeft: u.pending ? '3px solid #93c5fd' : '1px solid #bfdbfe', borderRadius: 1 }}>
                      <Typography variant="caption">{u.label || `event ${i + 1}`}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {new Date(u.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {u.pending && ' · pending'}
                      </Typography>
                      <Stack direction="row">
                        <IconButton size="small" onClick={() => openEdit('urine', u.createdAt, { label: u.label || '' })}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} aria-label="edit urine event">
                          <EditIcon sx={{ fontSize: 13 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => deleteUrine(u.createdAt)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} aria-label="delete urine event">
                          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  )
                ))}
              </Stack>
            </Box>

            {/* Liquid intake */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Liquid{liquidIntake.length > 0 ? ` (${liquidIntake.reduce((s, l) => s + l.ml, 0)} ml total)` : ''}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, mb: 0.5 }}>
                <TextField
                  size="small"
                  type="number"
                  placeholder="ml"
                  value={liquidMl}
                  onChange={e => setLiquidMl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLiquid(); } }}
                  sx={{ width: 80 }}
                  inputProps={{ min: 1 }}
                />
                <IconButton size="small" color="primary" onClick={handleAddLiquid}
                  disabled={!liquidMl || parseFloat(liquidMl) <= 0} aria-label="add liquid">
                  <AddIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Stack spacing={0.5}>
                {liquidIntake.map((l, i) => (
                  isEditing('liquid', l.createdAt) ? (
                    <Box key={i} sx={{ ...editRowSx, bgcolor: '#fefce8', borderColor: '#fde68a' }}>
                      <Stack spacing={0.75}>
                        <TextField size="small" type="number" value={editMl} onChange={e => setEditMl(e.target.value)}
                          label="ml" sx={{ width: 100 }} inputProps={{ min: 1 }} />
                        <TextField size="small" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} sx={{ width: 130 }} />
                        <Stack direction="row" spacing={0.5}>
                          <Button size="small" variant="contained" onClick={saveEdit} disabled={healthSaving} sx={{ fontSize: '0.7rem', py: 0.25 }}>Save</Button>
                          <Button size="small" variant="outlined" onClick={cancelEdit} sx={{ fontSize: '0.7rem', py: 0.25 }}>Cancel</Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ) : (
                    <Stack key={i} direction="row" alignItems="center" justifyContent="space-between"
                      sx={{ px: 1, py: 0.25, bgcolor: '#fefce8', border: '1px solid #fde68a', borderLeft: l.pending ? '3px solid #fcd34d' : '1px solid #fde68a', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{l.ml} ml</Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {new Date(l.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {l.pending && ' · pending'}
                      </Typography>
                      <Stack direction="row">
                        <IconButton size="small" onClick={() => openEdit('liquid', l.createdAt, { ml: l.ml })}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} aria-label="edit liquid entry">
                          <EditIcon sx={{ fontSize: 13 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => deleteLiquid(l.createdAt)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} aria-label="delete liquid entry">
                          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  )
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* Text notes */}
            {notes.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No notes for this day yet. Add observations below.
              </Typography>
            )}
            {notes.map((note, i) => (
              <Box
                key={i}
                sx={{
                  p: 1.5,
                  bgcolor: note.pending ? '#f0f9ff' : '#fffbeb',
                  border: note.pending ? '1px solid #bae6fd' : '1px solid #fde68a',
                  borderLeft: note.pending ? '3px solid #38bdf8' : '3px solid #f59e0b',
                  borderRadius: 1.5,
                  position: 'relative',
                }}
              >
                <Typography variant="body2" sx={{ pr: 3, whiteSpace: 'pre-wrap' }}>{note.text}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                  {new Date(note.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  {note.pending && ' · pending sync'}
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
            {connectionStatus === 'offline' && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontStyle: 'italic', mb: 0.75 }}>
                Offline — notes will sync when reconnected
              </Typography>
            )}
            <TextField
              size="small" fullWidth multiline maxRows={4}
              placeholder="e.g. Ketones 3.2, mild fever… Ctrl+Enter to save"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleAddNote(); } }}
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
