'use client';

import { Box, ButtonBase, Stack, type ButtonBaseProps } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export interface SelectionCardProps
  extends Omit<ButtonBaseProps, 'title' | 'children'> {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  selected: boolean;
}

export function SelectionCard({
  title,
  description,
  icon,
  selected,
  sx = [],
  ...props
}: SelectionCardProps) {
  return (
    <ButtonBase
      {...props}
      aria-pressed={selected}
      sx={[
        {
          width: '100%',
          flexShrink: 0,
          minHeight: 44,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          p: '12px',
          textAlign: 'left',
          justifyContent: 'flex-start',
          borderRadius: `${radius.md}px`,
          bgcolor: selected ? color.bg.neutral.default : 'transparent',
          boxShadow: selected
            ? `inset 0 0 0 1.5px ${color.brand.secondary.default}`
            : 'none',
          '&:hover': { bgcolor: color.bg.neutral.default },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {icon ? (
        <Box
          sx={{
            mt: '2px',
            flexShrink: 0,
            color: selected
              ? color.brand.secondary.subtle
              : color.fg.neutral.muted,
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Stack component="span" sx={{ minWidth: 0, gap: '3px' }}>
        <Box
          component="span"
          sx={{
            ...typography.label[400],
            fontWeight: selected ? 700 : 500,
            color: color.fg.neutral.default,
          }}
        >
          {title}
        </Box>
        {description ? (
          <Box
            component="span"
            sx={{
              ...typography.body[300],
              fontSize: 12,
              lineHeight: 1.55,
              color: color.fg.neutral.subtle,
            }}
          >
            {description}
          </Box>
        ) : null}
      </Stack>
    </ButtonBase>
  );
}
