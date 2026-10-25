'use client';

import { Box, type BoxProps } from '@mui/material';

import { designTokens } from '../../theme';

const { color, radius, shadow } = designTokens;

export function Card({ sx, ...props }: BoxProps) {
  return (
    <Box
      {...props}
      sx={[
        {
          p: 3,
          minWidth: 0,
          bgcolor: color.bg.neutral.default,
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          boxShadow: shadow.md,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
