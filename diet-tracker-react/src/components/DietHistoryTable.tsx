import { useEffect, useState } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, MenuItem, Select, FormControl, InputLabel, CircularProgress, TableFooter } from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { DAILY_REQUIREMENTS, type DailyRequirement } from './App';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const API_BASE_URL = '/api';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export default function DietHistoryTable() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [data, setData] = useState<{ [date: string]: { [cat: string]: number | null } }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchMonthData() {
      setLoading(true);
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`;
      const resp = await fetch(`${API_BASE_URL}/entries/batch/${start}/${end}`);
      if (resp.ok) {
        const obj = await resp.json();
        // obj: { 'YYYY-MM-DD': [ {category, amount, ...}, ... ] }
        const map: { [date: string]: { [cat: string]: number|null } } = {};
        Object.entries(obj).forEach(([date, arr]) => {
          map[date] = {};
          (arr as any[]).forEach(entry => {
            map[date][entry.category] = entry.amount;
          });
        });
        setData(map);
      }
      setLoading(false);
    }
    fetchMonthData();
  }, [year, month]);

  const days = getDaysInMonth(year, month);
  const dateList = Array.from({ length: days }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    return `${year}-${String(month + 1).padStart(2, '0')}-${d}`;
  });

  // Excel export handler
  const handleExport = () => {
    // Prepare header row: [Category, ...dates]
    const header = ['Category', ...dateList.map(dateStr => dateStr.slice(-2))];
    // Prepare data rows
    const rows = DAILY_REQUIREMENTS.map((req: DailyRequirement) => {
      const row = [
        `${req.category} (${req.amount} ${req.unit})`,
        ...dateList.map(dateStr => {
          const value = data[dateStr]?.[req.category];
          return value === null || value === undefined ? '-' : value;
        })
      ];
      return row;
    });
    // Prepare footer row (Overall %)
    const footer = [
      'Overall %',
      ...dateList.map(dateStr => {
        // Per-category percent (capped at 100%)
        const perCategoryPercents = DAILY_REQUIREMENTS.map((req: DailyRequirement) => {
          const val = data[dateStr]?.[req.category];
          const reqAmt = req.amount;
          if (val === null || val === undefined) return 0;
          return Math.min((val / reqAmt) * 100, 100);
        });
        const percent = perCategoryPercents.length > 0 ? Math.round(perCategoryPercents.reduce((a, b) => a + b, 0) / perCategoryPercents.length) : 0;
        return percent + '%';
      })
    ];
    // Combine all rows
    const worksheetData = [header, ...rows, footer];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diet History');
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
    const filename = `Diet_History_${monthName}_${year}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), filename);
  };

  return (
    <Box sx={{ width: '100%', mx: 'auto', mt: 4 }}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
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
          <Box sx={{ flex: 1 }} />
          <button onClick={handleExport} style={{ padding: '6px 16px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>
            Export to Excel
          </button>
        </Box>
      </LocalizationProvider>
      {loading ? <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} /> : (
        <TableContainer component={Paper}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem', bgcolor: 'grey.100', position: 'sticky', left: 0, zIndex: 2, width: 1, whiteSpace: 'nowrap', borderRight: 2, borderColor: 'grey.200' }}>Category</TableCell>
                {dateList.map(dateStr => (
                  <TableCell key={dateStr} align="center"
                    sx={{ fontWeight: 'bold', fontSize: '1rem', bgcolor: dateStr === todayStr ? 'primary.light' : 'grey.100', borderRight: 1, borderColor: 'grey.200' }}>
                    {dateStr.slice(-2)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {DAILY_REQUIREMENTS.map((req: DailyRequirement) => (
                <TableRow key={req.category}>
                  <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem', bgcolor: 'grey.100', position: 'sticky', left: 0, zIndex: 1, width: 1, whiteSpace: 'nowrap', borderRight: 2, borderColor: 'grey.200' }}>
                    {req.category}
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: '0.95em', ml: 0.5 }}>
                      ({req.amount} {req.unit})
                    </Box>
                  </TableCell>
                  {dateList.map(dateStr => {
                    const value = data[dateStr]?.[req.category];
                    const isFuture = new Date(dateStr) > today;
                    let cellSx: any = { borderRight: 1, borderColor: 'grey.200' };
                    if (dateStr === todayStr) cellSx = { ...cellSx, bgcolor: 'primary.lighter', fontWeight: 'bold' };
                    if (!isFuture) {
                      if (value === null || value === undefined) cellSx = { ...cellSx, bgcolor: '#ffeaea', color: 'error.dark', fontWeight: 'bold' };
                      else if (value === 0) cellSx = { ...cellSx, bgcolor: '#fff8e1', color: 'warning.dark', fontWeight: 'bold' };
                      else cellSx = { ...cellSx, bgcolor: '#e8f5e9', color: 'success.dark' };
                    }
                    return (
                      <TableCell key={dateStr} align="center" sx={cellSx}>
                        {value === null || value === undefined ? '-' : value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '1.1rem', bgcolor: 'grey.100', position: 'sticky', left: 0, zIndex: 1, width: 1, whiteSpace: 'nowrap', borderRight: 2, borderColor: 'grey.200' }}>Overall %</TableCell>
                {dateList.map(dateStr => {
                  // Calculate percent for this date (average per-category)
                  const isFuture = new Date(dateStr) > today;
                  const perCategoryPercents = DAILY_REQUIREMENTS.map((req: DailyRequirement) => {
                    const val = data[dateStr]?.[req.category];
                    const reqAmt = req.amount;
                    if (val === null || val === undefined) return 0;
                    return Math.min((val / reqAmt) * 100, 100);
                  });
                  const percent = perCategoryPercents.length > 0 ? Math.round(perCategoryPercents.reduce((a, b) => a + b, 0) / perCategoryPercents.length) : 0;
                  let cellSx: any = { fontWeight: 'bold', fontSize: '1.1rem', borderRight: 1, borderColor: 'grey.200' };
                  if (dateStr === todayStr) cellSx = { ...cellSx, bgcolor: 'primary.lighter' };
                  if (!isFuture) {
                    if (percent >= 90) cellSx = { ...cellSx, bgcolor: '#e8f5e9', color: 'success.dark' };
                    else if (percent >= 60) cellSx = { ...cellSx, bgcolor: '#fff8e1', color: 'warning.dark' };
                    else cellSx = { ...cellSx, bgcolor: '#ffeaea', color: 'error.dark' };
                  }
                  return (
                    <TableCell key={dateStr} align="center" sx={cellSx}>{percent}%</TableCell>
                  );
                })}
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
