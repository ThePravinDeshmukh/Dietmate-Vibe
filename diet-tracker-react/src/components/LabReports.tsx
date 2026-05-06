import { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Stack, Checkbox, FormControlLabel, CircularProgress, TextField, IconButton, Chip } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import AddIcon from '@mui/icons-material/Add';

const DEFAULT_PARAMS = ["C 3", "Total Carnitine", "Free Carnitine", "Acyl Carnitine", "Free / Acyl ratio"];

export default function LabReports() {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState<Date>(() => new Date());
  const [uploading, setUploading] = useState(false);
  const [paramInput, setParamInput] = useState('');
  const [extractParams, setExtractParams] = useState<string[]>(DEFAULT_PARAMS);
  const [selected, setSelected] = useState<string[]>([...DEFAULT_PARAMS]);
  const [trendData, setTrendData] = useState<any>({});
  const [allParams, setAllParams] = useState<string[]>([]);

  // Fetch all available parameters on mount
  useEffect(() => {
    fetch('/api/lab-reports/parameters')
      .then(res => res.json())
      .then(setAllParams);
  }, []);

  // Fetch trend data when selected changes
  useEffect(() => {
    if (selected.length > 0) {
      fetch(`/api/lab-reports/trends?params=${selected.join(',')}`)
        .then(res => res.json())
        .then(setTrendData);
    }
  }, [selected]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleAddParam = () => {
    const val = paramInput.trim();
    if (val && !extractParams.includes(val)) {
      setExtractParams([...extractParams, val]);
      setSelected([...selected, val]);
    }
    setParamInput('');
  };

  const handleUpload = async () => {
    if (!file || !date) return;
    setUploading(true);
    const dateStr = formatDateForApi(date);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', dateStr);
    formData.append('parameters', JSON.stringify(extractParams));
    const res = await fetch('/api/lab-reports/upload', {
      method: 'POST',
      body: formData
    });
    setUploading(false);
    if (res.ok) {
      alert('Uploaded and processed!');
      setFile(null);
      setDate(new Date());
      fetch('/api/lab-reports/parameters').then(res => res.json()).then(setAllParams);
    } else {
      alert('Upload failed');
    }
  };

  return (
    <Box sx={{ mx: 'auto', mt: 1 }}>
      <Paper sx={{ p: 2, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <input type="file" accept="application/pdf" onChange={handleFileChange} />
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Report Date"
              value={date}
              onChange={(d) => d && setDate(d)}
              format="dd-MM-yyyy"
              disableFuture
              slotProps={{ textField: { size: 'small' } }}
            />
          </LocalizationProvider>
          <Button variant="contained" onClick={handleUpload} disabled={uploading || !file || !date || extractParams.length === 0}>
            {uploading ? <CircularProgress size={20} /> : 'Upload'}
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2, mb: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Parameters to Extract</Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 1.5 }}>
          {extractParams.map(param => (
            <Chip
              key={param}
              size="small"
              label={param}
              color={selected.includes(param) ? 'primary' : 'default'}
              onClick={() => setSelected(sel => sel.includes(param) ? sel.filter(p => p !== param) : [...sel, param])}
              onDelete={DEFAULT_PARAMS.includes(param) ? undefined : () => setExtractParams(extractParams.filter(p => p !== param))}
              sx={{ m: 0.25, cursor: 'pointer', fontSize: '0.75rem' }}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" label="Add Parameter" value={paramInput} onChange={e => setParamInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddParam(); }} />
          <IconButton color="primary" onClick={handleAddParam}><AddIcon /></IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary">Click a chip to select/deselect. Remove custom chips with the cross.</Typography>
      </Paper>
      <Paper sx={{ p: 2, mb: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Select Parameters to View Trend</Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          {allParams.map(param => (
            <FormControlLabel
              key={param}
              control={<Checkbox size="small" checked={selected.includes(param)} onChange={e => {
                setSelected(sel => e.target.checked ? [...sel, param] : sel.filter(p => p !== param));
              }} />}
              label={param}
              sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
            />
          ))}
        </Stack>
      </Paper>
      {selected.length > 0 && trendData && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Trend Chart</Typography>
          <Line
            data={{
              labels: trendData.dates,
              datasets: selected.map((param: string, i: number) => ({
                label: param,
                data: trendData[param],
                borderColor: `hsl(${i * 60}, 70%, 50%)`,
                fill: false
              }))
            }}
            options={{ responsive: true, plugins: { legend: { position: 'top' } } }}
          />
        </Paper>
      )}
    </Box>
  );
}

function formatDateForApi(dateObj: Date) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
