import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Box, Container, Stack, Paper, Typography, Snackbar, Alert,
  Button, LinearProgress, Chip, CircularProgress, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  Tabs, Tab, BottomNavigation, BottomNavigationAction,
  Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Collapse,
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HomeIcon from '@mui/icons-material/Home';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import ScienceIcon from '@mui/icons-material/Science';
import ChatIcon from '@mui/icons-material/Chat';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { CloudDone, CloudOff } from '@mui/icons-material';
import type { NutrientEntry, DailyProgress } from '../types';
import { NutrientSlider } from './NutrientSlider';
import { ProgressChart } from './ProgressChart';
import { DietHistory } from './DietHistory';
import DietHistoryTable from './DietHistoryTable';
import LabReports from './LabReports';
import { ChatSidebar } from './ChatSidebar';
import { useChat } from '../hooks/useChat';
import { useNotes } from '../hooks/useNotes';
import { DAILY_REQUIREMENTS } from '../../shared/requirements.js';

const API_BASE_URL = '/api';

type AppTab = 'tracker' | 'history' | 'table' | 'lab-reports' | 'chat' | 'notes';

const DIET_SCHEDULE = [
  { time: '08:00 AM', action: 'Medication', item: 'Biotin, Atrest, Carnisure, Neutrolin' },
  { time: '08:30 AM', action: 'Feed', item: 'PA Formula (16g)' },
  { time: '10:30 AM', action: 'Feed', item: 'Cereal (7 exch) + Oil/Ghee (15g) + Sugar (10g)' },
  { time: '12:00 PM', action: 'Supplement', item: 'Isoleucine (1.5g) + Valine (2g)' },
  { time: '12:30 PM', action: 'Feed', item: 'Legumes (1.5 exch) + Other Veg (1.5 exch)' },
  { time: '02:30 PM', action: 'Feed', item: 'PA Formula (16g)' },
  { time: '04:30 PM', action: 'Medication', item: 'Carnisure, Flagyl' },
  { time: '05:00 PM', action: 'Feed', item: 'Fresh Fruit (2 exch) + Dried Fruit (1 exch) + Jaggery (10g)' },
  { time: '06:00 PM', action: 'Feed', item: 'Cereal (7 exch) + Root Veg (1.5 exch) + Oil/Ghee (15g)' },
  { time: '07:30 PM', action: 'Supplement', item: 'Isoleucine (1.5g) + Valine (2g)' },
  { time: '08:30 PM', action: 'Feed', item: 'Soy Milk (120ml) + Sugar (10g) + Ghee (5g)' },
  { time: '10:00 PM', action: 'Medication', item: 'Biotin, Atrest, Carnisure, Neutrolin, Flagyl, Calcimax' },
  { time: '10:30 PM', action: 'Feed', item: 'Cal-C Formula (20g)' },
  { time: '01:30 AM', action: 'Night Feed', item: 'Free Group (1.5 exch) + Jaggery (5g)' },
  { time: '04:30 AM', action: 'Night Feed', item: 'Free Group (1.5 exch) + Jaggery (5g)' },
];

const MEDICATIONS = [
  { name: 'Biotin',    dose: '1 tab',   freq: 'twice/day',  doses: 2, note: '' },
  { name: 'Atrest',   dose: '1/2 tab', freq: 'twice/day',  doses: 2, note: '' },
  { name: 'Calcimax', dose: '5ml',     freq: 'once/day',   doses: 1, note: '' },
  { name: 'Carnisure',dose: '5ml',     freq: 'thrice/day', doses: 3, note: '' },
  { name: 'Flagyl',   dose: '3.5ml',   freq: 'twice/day',  doses: 2, note: '10 days on, 20 days off' },
  { name: 'Neutrolin',dose: '5ml',     freq: 'twice/day',  doses: 2, note: '5 days on' },
];

const ACTION_BG: Record<string, string> = {
  Medication:  '#fef3c7',
  Feed:        '#f0fdf4',
  Supplement:  '#eff6ff',
  'Night Feed':'#f5f3ff',
};
const ACTION_COLOR: Record<string, string> = {
  Medication:  '#92400e',
  Feed:        '#166534',
  Supplement:  '#1e40af',
  'Night Feed':'#5b21b6',
};

type MedState = Record<string, boolean[]>;

function loadMedState(dateStr: string): MedState {
  try {
    const stored = localStorage.getItem(`med_${dateStr}`);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function persistMedState(dateStr: string, state: MedState) {
  localStorage.setItem(`med_${dateStr}`, JSON.stringify(state));
}

export function App() {
  return <AppContent />;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<AppTab>('tracker');
  const [nutrients, setNutrients] = useState<NutrientEntry[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const prevConnectionStatusRef = useRef<'online' | 'offline'>('online');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [slidersOpen, setSlidersOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [medOpen, setMedOpen] = useState(true);
  const dateStr = formatDateLocal(selectedDate);
  const [medState, setMedChecked] = useState<MedState>(() => loadMedState(formatDateLocal(new Date())));

  const { messages: chatMessages, sendMessage, retryLastMessage, loading: chatLoading, models: chatModels, selectedModel, setSelectedModel } = useChat(dateStr, () => loadDailyProgress(selectedDate));
  const { notes } = useNotes(dateStr);

  useEffect(() => {
    loadDailyProgress(selectedDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    setMedChecked(loadMedState(dateStr));
  }, [dateStr]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 60);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkPing = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/ping`, { cache: 'no-store' });
        if (!isMounted) return;
        const newStatus: 'online' | 'offline' = res.ok ? 'online' : 'offline';
        const wasOffline = prevConnectionStatusRef.current === 'offline';
        prevConnectionStatusRef.current = newStatus;
        setConnectionStatus(newStatus);
        if (wasOffline && newStatus === 'online') {
          loadDailyProgress(selectedDate);
        }
      } catch {
        if (!isMounted) return;
        prevConnectionStatusRef.current = 'offline';
        setConnectionStatus('offline');
      }
    };
    checkPing();
    const interval = setInterval(checkPing, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const loadDailyProgress = useCallback(async (dateObj: Date = new Date()) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      setLoading(true);
      const dateStr = formatDateLocal(dateObj);
      const response = await fetch(`${API_BASE_URL}/entries?date=${dateStr}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch entries');
      }
      const entries = await response.json();
      if (entries.length > 0) {
        const nutrientEntries = DAILY_REQUIREMENTS.map(req => {
          const dbEntry = entries.find((entry: any) => entry.category === req.category);
          return {
            category: req.category,
            amount: dbEntry ? dbEntry.amount : 0,
            unit: req.unit,
            required: req.amount
          };
        });
        const progress = {
          date: dateStr,
          entries: nutrientEntries,
          overallCompletion: calculateOverallCompletion(nutrientEntries)
        };
        setDailyProgress(progress);
        setNutrients(nutrientEntries);
      } else {
        const defaultNutrients = DAILY_REQUIREMENTS.map(req => ({
          category: req.category,
          amount: 0,
          unit: req.unit,
          required: req.amount
        }));
        setNutrients(defaultNutrients);
        setDailyProgress({
          date: dateStr,
          entries: defaultNutrients,
          overallCompletion: 0
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Backend still waking up — show zero state silently; Offline chip is visible
        const defaultNutrients = DAILY_REQUIREMENTS.map(req => ({
          category: req.category,
          amount: 0,
          unit: req.unit,
          required: req.amount
        }));
        setNutrients(defaultNutrients);
        setDailyProgress({
          date: formatDateLocal(dateObj),
          entries: defaultNutrients,
          overallCompletion: 0
        });
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const handleNutrientChange = async (category: string, amount: number) => {
    try {
      setSaveStatus('saving');
      const updatedNutrients = nutrients.map(nutrient =>
        nutrient.category === category ? { ...nutrient, amount } : nutrient
      );
      setNutrients(updatedNutrients);

      if (dailyProgress) {
        const updatedProgress = {
          ...dailyProgress,
          entries: updatedNutrients,
          overallCompletion: calculateOverallCompletion(updatedNutrients)
        };
        setDailyProgress(updatedProgress);
      }

      const dateStr = formatDateLocal(selectedDate);
      const response = await fetch(`${API_BASE_URL}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, amount, date: dateStr })
      });

      if (!response.ok) {
        setSaveStatus('error');
        throw new Error('Failed to update entry');
      }
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to update nutrient');
    }
  };

  const handleResetAll = async () => {
    try {
      const resetNutrients = nutrients.map(n => ({ ...n, amount: 0 }));
      setNutrients(resetNutrients);
      setDailyProgress(prev => prev ? { ...prev, entries: resetNutrients, overallCompletion: 0 } : null);
      const dateStr = formatDateLocal(selectedDate);
      await fetch(`${API_BASE_URL}/entries/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr })
      });
    } catch {
      setError('Failed to reset values');
    }
  };

  const handleSaveAll = async () => {
    try {
      const dateStr = formatDateLocal(selectedDate);
      const response = await fetch(`${API_BASE_URL}/entries/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          entries: nutrients.map(n => ({
            category: n.category,
            amount: n.amount,
            unit: n.unit,
          }))
        })
      });
      if (!response.ok) throw new Error('Failed to save all changes');
    } catch {
      setError('Failed to save all changes');
    }
  };

  const handleCopyFromYesterday = () => {
    setError('Copy from Yesterday not implemented yet');
  };

  const toggleMed = (medName: string, doseIdx: number) => {
    setMedChecked(prev => {
      const med = MEDICATIONS.find(m => m.name === medName)!;
      const doses = prev[medName] ? [...prev[medName]] : Array(med.doses).fill(false);
      doses[doseIdx] = !doses[doseIdx];
      const next = { ...prev, [medName]: doses };
      persistMedState(dateStr, next);
      return next;
    });
  };

  function getCurrentTimeTargetPct() {
    const milestones = [
      { hour: 7, minute: 0, pct: 0.15 },
      { hour: 10, minute: 30, pct: 0.25 },
      { hour: 13, minute: 0, pct: 0.5 },
      { hour: 16, minute: 30, pct: 0.65 },
      { hour: 19, minute: 30, pct: 0.85 },
      { hour: 21, minute: 0, pct: 1.0 }
    ];
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const currentMinutes = istNow.getHours() * 60 + istNow.getMinutes();
    let targetPct = 1.0;
    for (const m of milestones) {
      const milestoneMinutes = m.hour * 60 + m.minute;
      if (currentMinutes < milestoneMinutes) {
        targetPct = m.pct;
        break;
      }
    }
    return targetPct;
  }

  const goToPrevDay = () => {
    setSelectedDate(d => { const next = new Date(d); next.setDate(next.getDate() - 1); return next; });
  };

  const goToNextDay = () => {
    setSelectedDate(d => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return next > today ? d : next;
    });
  };

  const isToday = formatDateLocal(selectedDate) === formatDateLocal(new Date());

  const calculateOverallCompletion = (entries: NutrientEntry[]): number => {
    const completions = entries.map(entry =>
      Math.min((entry.amount / entry.required) * 100, 100)
    );
    return completions.reduce((sum, val) => sum + val, 0) / entries.length;
  };


  const currentCompletion = dailyProgress?.overallCompletion || 0;
  const targetPct = getCurrentTimeTargetPct();
  const isOnTrack = currentCompletion >= targetPct * 100;

  const chatTabView: 'chat' | 'notes' = activeTab === 'notes' ? 'notes' : 'chat';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>

      {/* ── App Header ── */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #0d6b4f 0%, #1B8A6B 65%, #2db882 100%)',
          py: 1.5,
          px: { xs: 2, md: 3 },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ maxWidth: 'lg', mx: 'auto' }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 44, height: 44, borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.15)',
                border: '2px solid rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
              }}
            >
              <Box
                component="img"
                src="/logo.svg"
                alt="IEM Vibe logo"
                sx={{ width: 36, height: 36 }}
              />
            </Box>
            <Box>
              <Typography
                variant="h5"
                sx={{ color: 'white', lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.3px' }}
              >
                IEM Vibe
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}
              >
                Diet Tracker
              </Typography>
            </Box>
          </Stack>

          <Chip
            icon={
              connectionStatus === 'online'
                ? <CloudDone fontSize="small" sx={{ color: '#86efac !important' }} />
                : <CloudOff fontSize="small" sx={{ color: '#fca5a5 !important' }} />
            }
            label={connectionStatus === 'online' ? 'Online' : 'Offline'}
            size="small"
            sx={{
              bgcolor: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.25)',
              fontWeight: 600,
            }}
          />
        </Stack>
      </Box>

      {/* ── Navigation Tabs (desktop) ── */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: { xs: 'none', md: 'block' } }}>
        <Container maxWidth="lg" disableGutters sx={{ px: { xs: 0.5, md: 2 } }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val as AppTab)}
            variant="scrollable"
            scrollButtons={false}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Tracker" value="tracker" />
            <Tab label="History" value="history" />
            <Tab label="Table" value="table" />
            <Tab label="Lab Reports" value="lab-reports" />
            <Tab
              label="Chat"
              value="chat"
              icon={<ChatIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
            <Tab
              label="Notes"
              value="notes"
              icon={<NoteAltIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
          </Tabs>
        </Container>
      </Box>

      {/* ── Page Content ── */}
      <Container
        maxWidth="lg"
        sx={{
          pt: { xs: 1.5, md: 3 },
          pb: { xs: '72px', md: 3 },
          px: { xs: 1.5, md: 3 },
        }}
      >
        {/* ── Tracker tab ── */}
        <Box sx={{ display: activeTab === 'tracker' ? 'block' : 'none' }}>
          {/* ── Sticky Toolbar ── */}
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1100,
              bgcolor: 'background.default',
              pt: 1.5,
              pb: 1,
              mb: 2,
              mx: { xs: -1.5, md: -3 },
              px: { xs: 1.5, md: 3 },
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title="Previous day">
                <IconButton onClick={goToPrevDay} size="small" aria-label="previous day">
                  <ChevronLeftIcon />
                </IconButton>
              </Tooltip>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Date"
                  value={selectedDate}
                  onChange={(date) => date && setSelectedDate(date)}
                  format="dd-MM-yyyy"
                  slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 130 } } }}
                  disableFuture
                />
              </LocalizationProvider>
              <Tooltip title="Next day">
                <span>
                  <IconButton onClick={goToNextDay} size="small" aria-label="next day" disabled={isToday}>
                    <ChevronRightIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Reset All Values">
                <IconButton onClick={handleResetAll} size="small" color="error">
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Copy from Yesterday">
                <IconButton onClick={handleCopyFromYesterday} size="small">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit Diet Sliders">
                <IconButton onClick={() => setSlidersOpen(true)} size="small">
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save All Changes">
                <IconButton onClick={handleSaveAll} size="small" color="primary">
                  <SaveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {/* ── Main content ── */}
          <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>

            {/* ── Progress Summary Card ── */}
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                mb: 1.5,
                background: isOnTrack
                  ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
                  : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: '1px solid',
                borderColor: isOnTrack ? '#bbf7d0' : '#fde68a',
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Today's Progress
              </Typography>

              <Stack direction="row" alignItems="center" spacing={2.5} sx={{ mt: 1.5 }}>
                <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                  <CircularProgress
                    variant="determinate"
                    value={100}
                    size={88}
                    thickness={5}
                    sx={{
                      color: isOnTrack ? 'rgba(22,163,74,0.15)' : 'rgba(245,158,11,0.2)',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}
                  />
                  <CircularProgress
                    variant="determinate"
                    value={Math.min(currentCompletion, 100)}
                    size={88}
                    thickness={5}
                    sx={{ color: isOnTrack ? '#16a34a' : '#f59e0b' }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 800,
                        lineHeight: 1,
                        fontSize: '1.15rem',
                        color: isOnTrack ? '#16a34a' : '#d97706',
                      }}
                    >
                      {Math.round(currentCompletion)}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', mt: 0.25 }}>
                      done
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Expected right now
                  </Typography>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 800,
                      lineHeight: 1,
                      color: isOnTrack ? '#16a34a' : '#d97706',
                      mb: 0.75,
                    }}
                  >
                    {Math.round(targetPct * 100)}%
                  </Typography>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.25,
                      borderRadius: 2,
                      bgcolor: isOnTrack ? '#dcfce7' : '#fef3c7',
                    }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: isOnTrack ? '#16a34a' : '#f59e0b',
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: isOnTrack ? '#16a34a' : '#d97706' }}
                    >
                      {isOnTrack
                        ? 'On Track'
                        : `${Math.round(targetPct * 100 - currentCompletion)}% behind`
                      }
                    </Typography>
                  </Box>
                </Box>
              </Stack>

              <LinearProgress
                variant="determinate"
                value={Math.min(currentCompletion, 100)}
                sx={{
                  height: 7,
                  mt: 2,
                  bgcolor: isOnTrack ? 'rgba(22,163,74,0.15)' : 'rgba(245,158,11,0.2)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: isOnTrack ? '#16a34a' : '#f59e0b',
                  },
                }}
              />
            </Paper>

            {/* ── Day Notes ── */}
            {notes.length > 0 && (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  mb: 1.5,
                  bgcolor: '#fefce8',
                  border: '1px solid #fef08a',
                  borderLeft: '3px solid #eab308',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Day Notes
                  </Typography>
                  <Chip label={notes.length} size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#eab308', color: 'white', fontWeight: 700 }} />
                </Stack>
                <Stack spacing={0.75}>
                  {notes.map((note, i) => (
                    <Stack key={i} direction="row" alignItems="flex-start" spacing={1}>
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#eab308', flexShrink: 0, mt: '7px' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.4 }}>{note.text}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                          {new Date(note.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* ── Save status ── */}
            <Stack direction="row" sx={{ mb: 1.5 }}>
              {saveStatus === 'saving' && (
                <Chip icon={<CircularProgress size={14} />} label="Saving…" color="info" variant="outlined" size="small" />
              )}
              {saveStatus === 'saved' && (
                <Chip label="All changes saved" color="success" variant="outlined" size="small" />
              )}
              {saveStatus === 'error' && (
                <Chip label="Save failed" color="error" variant="outlined" size="small" />
              )}
            </Stack>

            {/* ── Daily Diet Schedule ── */}
            <Paper elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setScheduleOpen(v => !v)}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Daily Diet Schedule</Typography>
                <IconButton size="small" disableRipple>
                  {scheduleOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Stack>
              <Collapse in={scheduleOpen}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', py: 0.75 }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.75 }}>Action</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.75 }}>Diet / Medical Item</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {DIET_SCHEDULE.map((row, i) => (
                        <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                          <TableCell sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap', color: 'text.secondary', py: 0.75 }}>
                            {row.time}
                          </TableCell>
                          <TableCell sx={{ py: 0.75 }}>
                            <Chip
                              label={row.action}
                              size="small"
                              sx={{
                                fontSize: '0.65rem',
                                height: 20,
                                fontWeight: 600,
                                bgcolor: ACTION_BG[row.action] || '#f3f4f6',
                                color: ACTION_COLOR[row.action] || '#374151',
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.75 }}>{row.item}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>

            {/* ── Medication Checklist ── */}
            <Paper elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setMedOpen(v => !v)}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Medication Checklist</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                    {displayDate(dateStr)} — saved locally
                  </Typography>
                </Box>
                <IconButton size="small" disableRipple>
                  {medOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Stack>
              <Collapse in={medOpen}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.75 }}>Medicine</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.75 }}>Dose</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.75, textAlign: 'center' }}>Given</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.75 }}>Note</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {MEDICATIONS.map((med) => {
                        const checked = medState[med.name] ?? Array(med.doses).fill(false);
                        const allDone = checked.slice(0, med.doses).every(Boolean);
                        return (
                          <TableRow
                            key={med.name}
                            sx={{
                              '&:last-child td': { border: 0 },
                              bgcolor: allDone ? 'rgba(22,163,74,0.04)' : 'transparent',
                            }}
                          >
                            <TableCell sx={{ py: 0.5 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.8rem',
                                  color: allDone ? '#16a34a' : 'text.primary',
                                  textDecoration: allDone ? 'line-through' : 'none',
                                }}
                              >
                                {med.name}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', py: 0.5, whiteSpace: 'nowrap' }}>
                              {med.dose} · {med.freq}
                            </TableCell>
                            <TableCell sx={{ py: 0.5 }}>
                              <Stack direction="row" spacing={0} justifyContent="center" alignItems="center">
                                {Array.from({ length: med.doses }).map((_, i) => (
                                  <Checkbox
                                    key={i}
                                    checked={!!checked[i]}
                                    onChange={() => toggleMed(med.name, i)}
                                    size="small"
                                    sx={{
                                      p: 0.5,
                                      color: 'text.disabled',
                                      '&.Mui-checked': { color: '#16a34a' },
                                    }}
                                  />
                                ))}
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.68rem', color: 'text.disabled', fontStyle: 'italic', py: 0.5 }}>
                              {med.note}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>

            {/* ── Category Chart ── */}
            {!loading && (
              <Paper
                elevation={0}
                sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  Category Progress
                </Typography>
                <ProgressChart nutrients={nutrients} />
              </Paper>
            )}
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 5 }}>
                <CircularProgress size={32} />
              </Box>
            )}
          </Box>

          {/* ── Edit Diet Modal ── */}
          <Dialog open={slidersOpen} onClose={() => setSlidersOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Edit Diet Entries</DialogTitle>
            <DialogContent>
              <Stack direction="row" sx={{ mb: 2 }}>
                {saveStatus === 'saving' && <Chip icon={<CircularProgress size={16} />} label="Saving…" color="info" variant="outlined" />}
                {saveStatus === 'saved'  && <Chip label="All changes saved" color="success" variant="outlined" />}
                {saveStatus === 'error'  && <Chip label="Save failed" color="error" variant="outlined" />}
              </Stack>
              {nutrients.map((nutrient) => (
                <Box key={nutrient.category} sx={{ mb: 2 }}>
                  <NutrientSlider
                    category={nutrient.category}
                    amount={nutrient.amount}
                    maxAmount={nutrient.required}
                    unit={nutrient.unit}
                    onChange={(value) => handleNutrientChange(nutrient.category, value)}
                  />
                </Box>
              ))}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleResetAll} color="error">Reset All</Button>
              <Button onClick={handleSaveAll} variant="contained">Save All</Button>
              <Button onClick={() => setSlidersOpen(false)}>Close</Button>
            </DialogActions>
          </Dialog>

          <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
            <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
          </Snackbar>
        </Box>

        {/* ── History tab ── */}
        <Box sx={{ display: activeTab === 'history' ? 'block' : 'none' }}>
          <DietHistory />
        </Box>

        {/* ── Table tab ── */}
        <Box sx={{ display: activeTab === 'table' ? 'block' : 'none' }}>
          <DietHistoryTable />
        </Box>

        {/* ── Lab Reports tab ── */}
        <Box sx={{ display: activeTab === 'lab-reports' ? 'block' : 'none' }}>
          <LabReports />
        </Box>

        {/* ── Chat & Notes tabs (shared ChatSidebar in full-page mode) ── */}
        <Box
          sx={{
            display: (activeTab === 'chat' || activeTab === 'notes') ? 'flex' : 'none',
            flexDirection: 'column',
            height: 'calc(100vh - 200px)',
            minHeight: 400,
          }}
        >
          <ChatSidebar
            fullPage
            externalTab={chatTabView}
            open
            date={dateStr}
            messages={chatMessages}
            onSendMessage={sendMessage}
            onRetry={retryLastMessage}
            loading={chatLoading}
            onClose={() => setActiveTab('tracker')}
            onToggle={() => {}}
            models={chatModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </Box>

      </Container>

      {/* ── Mobile Bottom Navigation ── */}
      <Box
        component="nav"
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1200,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <BottomNavigation
          value={activeTab}
          onChange={(_, val) => setActiveTab(val as AppTab)}
          sx={{ height: 56 }}
        >
          <BottomNavigationAction label="Tracker" value="tracker" icon={<HomeIcon />} sx={{ minWidth: 0, px: 0.5 }} />
          <BottomNavigationAction label="History" value="history" icon={<BarChartIcon />} sx={{ minWidth: 0, px: 0.5 }} />
          <BottomNavigationAction label="Table" value="table" icon={<TableChartIcon />} sx={{ minWidth: 0, px: 0.5 }} />
          <BottomNavigationAction label="Labs" value="lab-reports" icon={<ScienceIcon />} sx={{ minWidth: 0, px: 0.5 }} />
          <BottomNavigationAction label="Chat" value="chat" icon={<ChatIcon />} sx={{ minWidth: 0, px: 0.5 }} />
          <BottomNavigationAction label="Notes" value="notes" icon={<NoteAltIcon />} sx={{ minWidth: 0, px: 0.5 }} />
        </BottomNavigation>
      </Box>
    </Box>
  );
}

function formatDateLocal(dateObj: Date) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}
