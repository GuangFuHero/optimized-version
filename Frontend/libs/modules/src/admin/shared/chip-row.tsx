'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';

const { color, radius, typography } = designTokens;

/**
 * One filter as a row of chips: 全部 first, then the options; the chosen one is pressed. Each chip
 * is the design system's `Chip`, which both the station and ticket prototypes use.
 */
export function ChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* Narrow on purpose: a long label (指派 Team) wraps to two lines rather than widening the column. */}
      <Typography
        sx={{
          ...typography.body[300],
          lineHeight: 1.4,
          color: color.fg.neutral.muted,
          width: 64,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      {/* Named by the row's label, so a screen reader hears whose 「全部」 this is. */}
      <Box
        role="group"
        aria-label={label}
        sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
      >
        {[{ value: null, label: '全部' }, ...options].map((option) => {
          const selected = option.value === value;
          return (
            <ButtonBase
              key={option.value ?? '__all__'}
              aria-pressed={selected}
              onClick={() => onChange(option.value as T | null)}
              sx={{
                height: 32,
                px: '12px',
                borderRadius: `${radius.full}px`,
                ...typography.label[400],
                whiteSpace: 'nowrap',
                bgcolor: selected
                  ? color.bg.secondary.subtle
                  : color.bg.neutral.default,
                boxShadow: selected
                  ? `inset 0 0 0 1.5px ${color.brand.secondary.default}`
                  : `inset 0 0 0 1px ${color.border.default}`,
                color: selected
                  ? color.brand.secondary.subtle
                  : color.fg.neutral.subtle,
              }}
            >
              {option.label}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
