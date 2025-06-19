import { Box, Typography } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { NutrientEntry } from '../types';

interface ProgressChartProps {
  nutrients: NutrientEntry[];
}

export function ProgressChart({ nutrients }: ProgressChartProps) {
  const data = nutrients.map(nutrient => ({
    category: nutrient.category,
    completion: Math.min((nutrient.amount / nutrient.required) * 100, 100)
  }));

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Category Progress
      </Typography>
      <BarChart
        width={400}
        height={300}
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="category"
          angle={-45}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis
          domain={[0, 100]}
          label={{ value: 'Completion %', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          formatter={(value: number) => `${value.toFixed(1)}%`}
        />
        <Bar
          dataKey="completion"
          fill="#1976d2"
          name="Completion %"
        />
      </BarChart>
    </Box>
  );
}
