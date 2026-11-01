'use client';

import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '@rescue-frontend/ui';

const { color, radius, typography } = designTokens;

export const muted = { color: color.fg.neutral.muted } as const;
export const subtle = { color: color.fg.neutral.subtle } as const;

/** The prototype's thin scrollbars (`重複審核 Duplicate Review.html:11`). */
export const scrollbarSx = {
  '&::-webkit-scrollbar': { width: 10, height: 10 },
  '&::-webkit-scrollbar-thumb': {
    bgcolor: color.bg.neutral.sunken,
    borderRadius: '999px',
  },
} as const;

export const letter = (index: number) => String.fromCharCode(65 + index);

/** A, B: the order the two were created in (DUP-BE-412). */
export function LetterDot({
  index,
  on = false,
}: {
  index: number;
  on?: boolean;
}) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: `${radius.full}px`,
        bgcolor: on ? color.bg.primary.default : color.bg.neutral.sunken,
        color: on ? color.fg.onPrimary : color.fg.neutral.subtle,
        ...typography.data[300],
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {letter(index)}
    </Box>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'primary';
  icon?: ReactNode;
}) {
  const bg =
    tone === 'warning'
      ? color.bg.warning.subtle
      : tone === 'primary'
        ? color.bg.primary.subtle
        : color.bg.neutral.subtle;
  const fg = tone === 'warning' ? color.fg.warning : color.fg.neutral.subtle;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 22,
        px: 1,
        borderRadius: `${radius.full}px`,
        bgcolor: bg,
        color: fg,
        ...typography.data[300],
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </Box>
  );
}

export function Panel({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[
        {
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          bgcolor: color.bg.neutral.default,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
