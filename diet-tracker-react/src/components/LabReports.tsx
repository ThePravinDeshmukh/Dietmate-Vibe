import { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Stack, Checkbox, FormControlLabel, CircularProgress, TextField, IconButton, Chip } from '@mui/material';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import AddIcon from '@mui/icons-material/Add';

const DEFAULT_PARAMS = ["C 3", "Total Carnitine", "Free Carnitine", "Acyl Carnitine", "Free / Acyl ratio"];

export default function LabReports() {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', date);
    formData.append('parameters', JSON.stringify(extractParams));
    const res = await fetch('/api/lab-reports/upload', {
      method: 'POST',
      body: formData
    });
    setUploading(false);
    if (res.ok) {
      alert('Uploaded and processed!');
      setFile(null);
      setDate(new Date().toISOString().slice(0, 10));
      fetch('/api/lab-reports/parameters').then(res => res.json()).then(setAllParams);
    } else {
      alert('Upload failed');
    }
  };

  return (
    <Box sx={{ mx: 'auto', mt: 4 }}>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <input type="file" accept="application/pdf" onChange={handleFileChange} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Button variant="contained" onClick={handleUpload} disabled={uploading || !file || !date || extractParams.length === 0}>
            {uploading ? <CircularProgress size={20} /> : 'Upload'}
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1">Parameters to Extract</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
          {extractParams.map(param => (
            <Chip
              key={param}
              label={param}
              color={selected.includes(param) ? 'primary' : 'default'}
              onClick={() => setSelected(sel => sel.includes(param) ? sel.filter(p => p !== param) : [...sel, param])}
              onDelete={DEFAULT_PARAMS.includes(param) ? undefined : () => setExtractParams(extractParams.filter(p => p !== param))}
              sx={{ m: 0.5, cursor: 'pointer' }}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" label="Add Parameter" value={paramInput} onChange={e => setParamInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddParam(); }} />
          <IconButton color="primary" onClick={handleAddParam}><AddIcon /></IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary">Click a chip to select/deselect. Remove custom chips with the cross.</Typography>
      </Paper>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1">Select Parameters to View Trend</Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          {allParams.map(param => (
            <FormControlLabel
              key={param}
              control={<Checkbox checked={selected.includes(param)} onChange={e => {
                setSelected(sel => e.target.checked ? [...sel, param] : sel.filter(p => p !== param));
              }} />}
              label={param}
            />
          ))}
        </Stack>
      </Paper>
      {selected.length > 0 && trendData && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1">Trend Chart</Typography>
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
