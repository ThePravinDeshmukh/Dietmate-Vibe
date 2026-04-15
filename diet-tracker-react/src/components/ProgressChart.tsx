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
          layout="vertical"
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 80,
            bottom: 5
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 100]}
            label={{ value: 'Completion %', position: 'insideBottom', offset: -2 }}
          />
          <YAxis
            type="category"
            dataKey="category"
            width={75}
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
