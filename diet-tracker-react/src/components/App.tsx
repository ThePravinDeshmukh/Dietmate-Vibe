import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Box, Container, Stack, Paper, Typography, Snackbar, Alert, Button, LinearProgress, Chip, CircularProgress } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import type { NutrientEntry, DailyProgress } from '../types';
import { NutrientSlider } from './NutrientSlider';
import { ProgressChart } from './ProgressChart';
import Tooltip from '@mui/material/Tooltip';
import { DietHistory } from './DietHistory';
import DietHistoryTable from './DietHistoryTable';
import LabReports from './LabReports';
import { CloudDone, CloudOff } from '@mui/icons-material';
import { urlBase64ToUint8Array } from '../pushUtils';

const API_BASE_URL = '/api';

export function App() {
  const [nutrients, setNutrients] = useState<NutrientEntry[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  useEffect(() => {
    loadDailyProgress(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 60); // update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkPing = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/ping`, { cache: 'no-store' });
        if (isMounted) setConnectionStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (isMounted) setConnectionStatus('offline');
      }
    };
    checkPing();
    const interval = setInterval(checkPing, 10000); // every 10s
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const loadDailyProgress = async (dateObj = new Date()) => {
    try {
      setLoading(true);
      const dateStr = formatDateLocal(dateObj);
      const response = await fetch(`${API_BASE_URL}/entries?date=${dateStr}`);
      if (!response.ok) {
        throw new Error('Failed to fetch entries');
      }
      const entries = await response.json();
      if (entries.length > 0) {
        const nutrientEntries = DAILY_REQUIREMENTS.map(req => {
            const dbEntry = entries.find((entry: any) => entry.category === req.category);          return {
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
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleNutrientChange = async (category: string, amount: number) => {
    try {
      setSaveStatus('saving');
      const updatedNutrients = nutrients.map(nutrient =>
        nutrient.category === category ? { ...nutrient, amount } : nutrient
      );
      setNutrients(updatedNutrients);

      // Update progress
      if (dailyProgress) {
        const updatedProgress = {
          ...dailyProgress,
          entries: updatedNutrients,
          overallCompletion: calculateOverallCompletion(updatedNutrients)
        };
        setDailyProgress(updatedProgress);
      }

      // Save to database with correct date
      const dateStr = formatDateLocal(selectedDate);
      const response = await fetch(`${API_BASE_URL}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  // Reset all values to 0
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
    } catch (err) {
      setError('Failed to reset values');
    }
  };

  // Save all changes (batch update)
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
    } catch (err) {
      setError('Failed to save all changes');
    }
  };

  // Copy from yesterday (placeholder)
  const handleCopyFromYesterday = () => {
    setError('Copy from Yesterday not implemented yet');
  };

  // --- New: Calculate target for current time (IST, milestone-based) ---
  function getCurrentTimeTarget(entries: NutrientEntry[]) {
    // Milestone schedule (IST)
    const milestones = [
      { hour: 7, minute: 0, pct: 0.15 },    // 7:00  15%
      { hour: 10, minute: 30, pct: 0.25 }, // 10:30 25%
      { hour: 13, minute: 0, pct: 0.5 },   // 13:00 50%
      { hour: 16, minute: 30, pct: 0.65 }, // 16:30 65%
      { hour: 19, minute: 30, pct: 0.85 }, // 19:30 85%
      { hour: 21, minute: 0, pct: 1.0 }    // 21:00 100%
    ];
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const currentMinutes = istNow.getHours() * 60 + istNow.getMinutes();
    let targetPct = 1.0; // Default to 100%
    for (const m of milestones) {
      const milestoneMinutes = m.hour * 60 + m.minute;
      if (currentMinutes < milestoneMinutes) {
        targetPct = m.pct;
        break;
      }
    }
    return entries.map(entry => ({
      ...entry,
      target: entry.required * targetPct
    }));
  }

  // --- New: Calculate target for current time (IST, milestone-based) ---
  function getCurrentTimeTargetPct() {
    // Milestone schedule (IST)
    const milestones = [
      { hour: 7, minute: 0, pct: 0.15 },    // 7:00  15%
      { hour: 10, minute: 30, pct: 0.25 }, // 10:30 25%
      { hour: 13, minute: 0, pct: 0.5 },   // 13:00 50%
      { hour: 16, minute: 30, pct: 0.65 }, // 16:30 65%
      { hour: 19, minute: 30, pct: 0.85 }, // 19:30 85%
      { hour: 21, minute: 0, pct: 1.0 }    // 21:00 100%
    ];
    const istNow = new Date(now.getTime());
    const currentMinutes = istNow.getHours() * 60 + istNow.getMinutes();
    let targetPct = 1.0; // Default to 100%
    for (const m of milestones) {
      const milestoneMinutes = m.hour * 60 + m.minute;
      if (currentMinutes < milestoneMinutes) {
        targetPct = m.pct;
        break;
      }
    }
    return targetPct;
  }


  // --- New: Smart Suggestions ---
  function getSmartSuggestions(entries: NutrientEntry[]) {
    // Suggest nutrients that are farthest from target for current time
    const targets = getCurrentTimeTarget(entries);
    const suggestions = targets
      .filter(e => e.amount < e.target)
      .sort((a, b) => (a.amount - a.target) - (b.amount - b.target))
      .slice(0, 2)
      .map(e => `Consider adding more ${e.category} (${Math.round(e.target - e.amount)} ${e.unit})`);
    if (suggestions.length === 0) return ['You are on track!'];
    return suggestions;
  }

  const calculateOverallCompletion = (entries: NutrientEntry[]): number => {
    const completions = entries.map(entry => 
      Math.min((entry.amount / entry.required) * 100, 100)
    );
    return completions.reduce((sum, val) => sum + val, 0) / entries.length;
  };

  async function subscribeUserToPush() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Please enable notifications!');
      return;
    }
    // Get public VAPID key from backend
    const resp = await fetch('/api/vapid-public-key');
    let vapidPublicKey = await resp.text();
    vapidPublicKey = vapidPublicKey.trim(); // Remove whitespace/newlines
    console.log('VAPID public key (before decode):', JSON.stringify(vapidPublicKey));
    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    // Send subscription to backend
    await fetch('/api/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    alert('Push subscription successful!');
  }

  return (
    <BrowserRouter>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            IEM Vibe
          </Typography>
          <Chip
            icon={connectionStatus === 'online' ? <CloudDone sx={{ color: 'green' }} /> : <CloudOff sx={{ color: 'red' }} />}
            label={connectionStatus === 'online' ? 'Online' : 'Offline'}
            color={connectionStatus === 'online' ? 'success' : 'error'}
            variant="outlined"
            sx={{ minWidth: 100 }}
          />
        </Stack>
        <Box sx={{ mb: 2 }}>
          <Button component={Link} to="/" variant="text" sx={{ mr: 1 }}>Tracker</Button>
          <Button component={Link} to="/history" variant="text">History</Button>
          <Button component={Link} to="/history-table" variant="text">Table</Button>
          <Button component={Link} to="/lab-reports" variant="text">Lab Reports</Button>
        </Box>
        <Routes>
          <Route path="/" element={
            <>
              {/* --- Top bar: DatePicker and action buttons in a row --- */}
              <Stack
                direction="row"
                spacing={1}
                alignItems="flex-start"
                justifyContent="flex-start"
                flexWrap="wrap"
                sx={{
                  mb: 3,
                  position: 'sticky',
                  top: 0,
                  zIndex: 1100,
                  bgcolor: 'background.paper',
                  py: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Select Date"
                    value={selectedDate}
                    onChange={(date) => date && setSelectedDate(date)}
                    slotProps={{ textField: { size: 'small', sx: { width: 140, mr: 1, mb: { xs: 1, sm: 0 } } } }}
                    disableFuture
                  />
                </LocalizationProvider>
                <Tooltip title="Reset All Values">
                  <Button variant="outlined" color="secondary" onClick={handleResetAll} sx={{ minWidth: 64, mr: 1, mb: { xs: 1, sm: 0 } }}>Reset</Button>
                </Tooltip>
                <Tooltip title="Copy from Yesterday">
                  <Button variant="outlined" color="primary" onClick={handleCopyFromYesterday} sx={{ minWidth: 64, mr: 1, mb: { xs: 1, sm: 0 } }}>Copy</Button>
                </Tooltip>
                <Tooltip title="Save All Changes">
                  <Button variant="contained" color="primary" onClick={handleSaveAll} sx={{ minWidth: 64, mb: { xs: 1, sm: 0 } }}>Save</Button>
                </Tooltip>
              </Stack>
              {/* --- New: Summary Section --- */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="subtitle1">Overall Completion</Typography>
                    <LinearProgress variant="determinate" value={dailyProgress?.overallCompletion || 0} sx={{ height: 10, borderRadius: 5, mb: 1 }} />
                    <Typography variant="body2">{Math.round(dailyProgress?.overallCompletion || 0)}%</Typography>
                  </Box>
                  <Box>
                    <Typography variant="subtitle1">Target for Current Time</Typography>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        color="primary"
                        label={`Expected: ${Math.round(getCurrentTimeTargetPct() * 100)}% of daily diet`}
                      />
                    </Stack>
                  </Box>
                </Stack>
              </Paper>

              {/* --- New: Smart Suggestions --- */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" gutterBottom>Smart Suggestions</Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {getSmartSuggestions(nutrients).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </Paper>

              {/* --- Existing controls and sliders --- */}
              {loading ? (
                <Typography>Loading...</Typography>
              ) : (
                <Box sx={{ flexGrow: 1 }}>
                  <Stack spacing={3}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                      <Paper sx={{ p: 2, flex: 2 }}>
                        {/* --- New: Save status indicator --- */}
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                          {saveStatus === 'saving' && <Chip icon={<CircularProgress size={16} />} label="Saving..." color="info" variant="outlined" />}
                          {saveStatus === 'saved' && <Chip label="All changes saved" color="success" variant="outlined" />}
                          {saveStatus === 'error' && <Chip label="Save failed" color="error" variant="outlined" />}
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
                      </Paper>

                      <Paper sx={{ p: 2, flex: 1 }}>
                        <ProgressChart nutrients={nutrients} />
                      </Paper>
                    </Stack>
                  </Stack>
                </Box>
              )}

              <Snackbar 
                open={!!error} 
                autoHideDuration={6000} 
                onClose={() => setError(null)}
              >
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              </Snackbar>
            </>
          } />
          <Route path="/history" element={<DietHistory />} />
          <Route path="/history-table" element={<DietHistoryTable />} />
          <Route path="/lab-reports" element={<LabReports />} />
        </Routes>
        <Button onClick={subscribeUserToPush}>Enable Push Notifications</Button>
      </Container>
    </BrowserRouter>
  );
}

// Helper to format date as YYYY-MM-DD in local time (no timezone shift)
function formatDateLocal(dateObj: Date) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type DailyRequirement = {
  category: string;
  amount: number;
  unit: string;
};

export const DAILY_REQUIREMENTS: DailyRequirement[] = [
  { category: "cereal", amount: 13, unit: "exchange" },
  { category: "dried fruit", amount: 1, unit: "exchange" },
  { category: "fresh fruit", amount: 3, unit: "exchange" },
  { category: "legumes", amount: 3, unit: "exchange" },
  { category: "other vegetables", amount: 3, unit: "exchange" },
  { category: "root vegetables", amount: 2, unit: "exchange" },
  { category: "free group", amount: 3, unit: "exchange" },
  { category: "jaggery", amount: 20, unit: "grams" },
  { category: "soy milk", amount: 120, unit: "ml" },
  { category: "sugar", amount: 10, unit: "grams" },
  { category: "oil ghee", amount: 30, unit: "grams" },
  { category: "pa formula", amount: 32, unit: "grams" },
  { category: "cal-c formula", amount: 24, unit: "grams" },
  { category: "isoleucine", amount: 3, unit: "grams" },
  { category: "valine", amount: 4, unit: "grams" }
];
