'use client';

import { Box, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import type { ReactNode } from 'react';

const { color, typography } = designTokens;

// The prototype's faint rule between a drawer's rows (station-drawer.jsx), lighter than a border.
const ROW_BORDER = `1px solid ${color.bg.neutral.sunken}`;

/** One fact in a detail sheet: its caption on the left, the value on the right. */
export function DetailRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        minHeight: 48,
        boxSizing: 'border-box',
        py: '12px',
        borderTop: ROW_BORDER,
      }}
    >
      <Caption>{label}</Caption>
      <Box
        component="span"
        sx={{
          ...typography.body[400],
          color: color.fg.neutral.default,
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-line',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** A row whose value is too wide to sit beside its caption: the caption over it. */
export function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ py: '12px', borderTop: ROW_BORDER }}>
      <Box sx={{ mb: '8px' }}>
        <Caption>{label}</Caption>
      </Box>
      {children}
    </Box>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{
        ...typography.body[300],
        fontSize: 15,
        color: color.fg.neutral.muted,
        flexShrink: 0,
      }}
    >
      {children}
    </Typography>
  );
}
