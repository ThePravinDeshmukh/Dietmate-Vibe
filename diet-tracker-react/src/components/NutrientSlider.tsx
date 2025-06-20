import { Box, Slider, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

interface NutrientSliderProps {
  category: string;
  amount: number;
  maxAmount: number;
  unit: string;
  onChange: (value: number) => void;
}

const SliderContainer = styled(Box)({
  padding: '0.5rem 0',
});

export function NutrientSlider({
  category,
  amount,
  maxAmount,
  unit,
  onChange,
}: NutrientSliderProps) {
  const completion = (amount / maxAmount) * 100;
  const statusEmoji = completion >= 100 ? '✅' : '⚠️';

  return (
    <SliderContainer>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body1" fontWeight="bold">
          {statusEmoji} {category}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {amount.toFixed(1)}/{maxAmount} {unit}
        </Typography>
      </Box>
      <Slider
        value={amount}
        min={0}
        max={maxAmount}
        step={0.5}
        onChange={(_, value) => onChange(value as number)}
        sx={{
          mt: 1,
          '& .MuiSlider-track': {
            backgroundColor: completion >= 100 ? '#28a745' : '#1976d2',
          },
        }}
      />
    </SliderContainer>
  );
}
