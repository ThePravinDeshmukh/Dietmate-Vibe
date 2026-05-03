import { Box } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 10, left: -20, bottom: 72 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="category"
            angle={-45}
            textAnchor="end"
            interval={0}
            tick={{ fontSize: 10 }}
            height={80}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
            width={42}
          />
          <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'Completion']} />
          <Bar dataKey="completion" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.completion >= 100 ? '#16a34a' : entry.completion >= 60 ? '#1B8A6B' : '#f59e0b'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
