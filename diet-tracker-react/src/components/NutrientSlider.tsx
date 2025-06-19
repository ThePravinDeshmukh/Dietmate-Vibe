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
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  padding: '0.5rem 0',
});

const ValueDisplay = styled(Typography)({
  minWidth: '100px',
  fontWeight: 'bold',
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
      <ValueDisplay variant="body1">
        {statusEmoji} {category}
      </ValueDisplay>
      <Slider
        value={amount}
        min={0}
        max={maxAmount}
        step={0.5}
        onChange={(_, value) => onChange(value as number)}
        sx={{
          '& .MuiSlider-track': {
            backgroundColor: completion >= 100 ? '#28a745' : '#1976d2',
          },
        }}
      />
      <Typography variant="body2" sx={{ minWidth: '80px' }}>
        {amount.toFixed(1)}/{maxAmount} {unit}
      </Typography>
    </SliderContainer>
  );
}
