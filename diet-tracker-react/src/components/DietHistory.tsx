import { useEffect, useState } from 'react';
import { Box, Paper, Typography, CircularProgress, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers';

const API_BASE_URL = '/api';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to interpolate color from red (0%) to orange (50%) to green (100%)
function getPercentGradientColor(pct: number) {
  // 0%: #f44336 (red), 50%: #ff9800 (orange), 100%: #388e3c (green)
  if (pct <= 50) {
    // Red to Orange
    const ratio = pct / 50;
    const r = Math.round(244 + (255 - 244) * ratio);
    const g = Math.round(67 + (152 - 67) * ratio);
    const b = Math.round(54 + (0 - 54) * ratio);
    return `rgb(${r},${g},${b})`;
  } else {
    // Orange to Green
    const ratio = (pct - 50) / 50;
    const r = Math.round(255 + (56 - 255) * ratio);
    const g = Math.round(152 + (142 - 152) * ratio);
    const b = Math.round(0 + (60 - 0) * ratio);
    return `rgb(${r},${g},${b})`;
  }
}

export function DietHistory() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [data, setData] = useState<{ [date: string]: number }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchMonthData() {
      setLoading(true);
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`;
      const resp = await fetch(`${API_BASE_URL}/history?start=${start}&end=${end}`);
      if (resp.ok) {
        const arr = await resp.json();
        // arr: [{date: 'YYYY-MM-DD', overallCompletion: 87}, ...]
        const map: { [date: string]: number } = {};
        arr.forEach((d: any) => { map[d.date] = d.overallCompletion; });
        setData(map);
      }
      setLoading(false);
    }
    fetchMonthData();
  }, [year, month]);

  const days = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const weeks: Array<Array<number | null>> = [];
  let week: Array<number | null> = Array(firstDay).fill(null);
  for (let d = 1; d <= days; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  return (
    <Box sx={{ width: '100%', mx: 'auto', mt: 4 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, justifyContent: 'left' }}>
            <FormControl size="small">
              <InputLabel>Month</InputLabel>
              <Select value={month} label="Month" onChange={e => setMonth(Number(e.target.value))}>
                {[...Array(12)].map((_, i) => (
                  <MenuItem key={i} value={i}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>Year</InputLabel>
              <Select value={year} label="Year" onChange={e => setYear(Number(e.target.value))}>
                {[...Array(5)].map((_, i) => {
                  const y = today.getFullYear() - 2 + i;
                  return <MenuItem key={y} value={y}>{y}</MenuItem>;
                })}
              </Select>
            </FormControl>
          </Box>
        </LocalizationProvider>
        {loading ? <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} /> : (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 0.5,
            borderRadius: 2,
            overflowX: 'auto',
            boxSizing: 'border-box',
            background: 'none',
            border: 'none',
            mx: 'auto',
            width: '100%',
            minWidth: 350, // Ensures grid scrolls on small screens
            maxWidth: '100vw',
          }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => (
              <Box key={day} sx={{ textAlign: 'center', fontWeight: 'bold', py: 1 }}>
                <Typography variant="caption" fontSize={20}>{day}</Typography>
              </Box>
            ))}
            {weeks.map((week, i) => week.map((d, j) => {
              const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const percentRaw = data[dateKey];
              const percent = percentRaw ?? null;
              const isToday = d &&
                year === today.getFullYear() &&
                month === today.getMonth() &&
                d === today.getDate();
              // Check if this date is in the future
              const cellDate = d ? new Date(year, month, d) : null;
              const isFuture = cellDate && cellDate > new Date(today.getFullYear(), today.getMonth(), today.getDate());
              return (
                <Box
                  key={i + '-' + j}
                  sx={{
                    border: isToday ? '2px solid #1976d2' : '1px solid #ccc',
                    height: 56,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: d ? (isToday ? '#e3f2fd' : '#fff') : 'transparent',
                    p: 1,
                    boxSizing: 'border-box',
                    position: 'relative',
                    transition: 'border 0.2s, background 0.2s',
                  }}
                >
                  {d ? (
                    <>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ position: 'absolute', top: 4, left: 8, fontSize: 14, fontWeight: 700 }}
                      >
                        {d}
                      </Typography>
                      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 2,
                            bgcolor:
                              isFuture || percent === null
                                ? 'grey.100'
                                : getPercentGradientColor(percent),
                            color:
                              isFuture || percent === null
                                ? 'text.disabled'
                                : '#fff',
                            fontWeight: 700,
                            fontSize: 16,
                            minWidth: 36,
                            textAlign: 'center',
                            transition: 'all 0.2s',
                            boxShadow: percent > 0 && !isFuture ? 1 : 0,
                            display: 'inline-block',
                          }}
                        >
                          {isFuture || percent === null ? '-' : `${Math.round(percent)}%`}
                        </Box>
                      </Box>
                    </>
                  ) : null}
                </Box>
              );
            }))}
          </Box>
        )}
    </Box>
  );
}
