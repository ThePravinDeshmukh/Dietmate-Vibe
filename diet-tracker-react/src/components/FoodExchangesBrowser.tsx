import { useState, useMemo } from 'react';
import {
  Box, Paper, Stack, TextField, Typography, InputAdornment, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { FOOD_EXCHANGES } from '../../shared/foodExchanges.js';
import type { FoodItem } from '../../shared/foodExchanges.js';

export default function FoodExchangesBrowser() {
  const [query, setQuery] = useState('');
  const lower = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return Object.entries(FOOD_EXCHANGES).map(([cat, items]: [string, FoodItem[]]) => ({
      cat,
      items: lower ? items.filter(i => i.name.toLowerCase().includes(lower)) : items,
    })).filter(({ items }) => items.length > 0);
  }, [lower]);

  const totalShown = filtered.reduce((sum, { items }) => sum + items.length, 0);

  return (
    <Box>
      <Stack spacing={2}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search food items…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />

        <Typography variant="caption" color="text.secondary">
          {lower
            ? `${totalShown} item${totalShown !== 1 ? 's' : ''} matching "${query.trim()}"`
            : `${totalShown} items across ${filtered.length} categories`}
        </Typography>

        {filtered.map(({ cat, items }) => (
          <Paper key={cat} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" sx={{ textTransform: 'capitalize', fontWeight: 600 }}>
                  {cat}
                </Typography>
                <Chip label={items.length} size="small" sx={{ height: 18, fontSize: 11 }} />
              </Stack>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              }}
            >
              {items.map((item, idx) => (
                <Stack
                  key={item.name}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    px: 2,
                    py: 0.75,
                    borderBottom: idx < items.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Typography variant="body2">{item.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {item.gramsPerExchange}&thinsp;{item.unit ?? 'g'}
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Paper>
        ))}

        {filtered.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
            No food items found for "{query.trim()}"
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
