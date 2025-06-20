import { useEffect, useState } from 'react';import { Box, Container, Stack, Paper, Typography, Snackbar, Alert, Button, Stack as MuiStack } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import type { NutrientEntry, DailyProgress } from '../types';
import { NutrientSlider } from './NutrientSlider';
import { MetricsDisplay } from './MetricsDisplay';
import { ProgressChart } from './ProgressChart';

const API_BASE_URL = '/api';

export function App() {
  const [nutrients, setNutrients] = useState<NutrientEntry[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    loadDailyProgress(selectedDate);
  }, [selectedDate]);

  const loadDailyProgress = async (dateObj = new Date()) => {
    try {
      setLoading(true);
      const dateStr = formatDateIST(dateObj);
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

      // Save to database with correct IST date
      const dateStr = formatDateIST(selectedDate);
      const response = await fetch(`${API_BASE_URL}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category, amount, date: dateStr })
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update nutrient');
    }
  };

  // Reset all values to 0
  const handleResetAll = async () => {
    try {
      const resetNutrients = nutrients.map(n => ({ ...n, amount: 0 }));
      setNutrients(resetNutrients);
      setDailyProgress(prev => prev ? { ...prev, entries: resetNutrients, overallCompletion: 0 } : null);
      const dateStr = formatDateIST(selectedDate);
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
      const dateStr = formatDateIST(selectedDate);
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

  const calculateOverallCompletion = (entries: NutrientEntry[]): number => {
    const completions = entries.map(entry => 
      Math.min((entry.amount / entry.required) * 100, 100)
    );
    return completions.reduce((sum, val) => sum + val, 0) / entries.length;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Daily Diet Tracker
      </Typography>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : (
        <Box sx={{ flexGrow: 1 }}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Select Date"
              value={selectedDate}
              onChange={(date) => date && setSelectedDate(date)}
              slotProps={{ textField: { size: 'small', sx: { mb: 2, width: 200 } } }}
              disableFuture
            />
          </LocalizationProvider>
          <MuiStack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <Button variant="outlined" color="secondary" onClick={handleResetAll}>Reset All Values</Button>
            <Button variant="outlined" color="primary" onClick={handleCopyFromYesterday}>Copy from Yesterday</Button>
            <Button variant="contained" color="primary" onClick={handleSaveAll}>Save All Changes</Button>
          </MuiStack>

          <Stack spacing={3}>
            <Paper sx={{ p: 2 }}>
              <MetricsDisplay dailyProgress={dailyProgress} />
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
              <Paper sx={{ p: 2, flex: 2 }}>
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
    </Container>
  );
}

// Helper to format date as YYYY-MM-DD in IST
function formatDateIST(dateObj: Date) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(dateObj.getTime() + istOffset);
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAILY_REQUIREMENTS = [
  { category: "cereal", amount: 12.5, unit: "exchange" },
  { category: "dried fruit", amount: 1, unit: "exchange" },
  { category: "fresh fruit", amount: 1, unit: "exchange" },
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
  { category: "isoleucine", amount: 4, unit: "grams" },
  { category: "valine", amount: 4, unit: "grams" }
];
