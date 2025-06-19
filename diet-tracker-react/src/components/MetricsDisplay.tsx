import { Box, Typography, LinearProgress } from '@mui/material';
import type { DailyProgress } from '../types';

interface MetricsDisplayProps {
  dailyProgress: DailyProgress | null;
}

export function MetricsDisplay({ dailyProgress }: MetricsDisplayProps) {
  if (!dailyProgress) {
    return null;
  }

  const { overallCompletion, entries } = dailyProgress;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Daily Progress
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Overall Completion
        </Typography>
        <LinearProgress 
          variant="determinate" 
          value={overallCompletion} 
          sx={{ height: 10, borderRadius: 5 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {Math.round(overallCompletion)}%
        </Typography>
      </Box>
      
      <Typography variant="subtitle1" gutterBottom>
        Nutrient Summary
      </Typography>
      {entries.map(entry => (
        <Box key={entry.category} sx={{ mb: 1 }}>
          <Typography variant="body2">
            {entry.category}: {entry.amount} / {entry.required} {entry.unit}s
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={Math.min((entry.amount / entry.required) * 100, 100)}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      ))}
    </Box>
  );
}
