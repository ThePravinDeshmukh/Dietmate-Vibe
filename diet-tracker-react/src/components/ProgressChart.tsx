import { Box } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{
            top: 5,
            right: 10,
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
      </ResponsiveContainer>
    </Box>
  );
}
