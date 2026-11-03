'use client';

import type { ReactNode } from 'react';

import { Box, Stack, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, spacing } = designTokens;

/** A detail drawer's small heading over a block or a row (prototype `sectionLabel`). */
export function SiteDetailLabel({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      sx={[
        {
          mb: '6px',
          fontSize: displayTextSize[11],
          fontWeight: 700,
          lineHeight: 1.4,
          letterSpacing: '.08em',
          color: color.fg.neutral.muted,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

/** A detail drawer's row: its label over an icon and the value (prototype `InfoRow`). */
export function SiteDetailRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <SiteDetailLabel>{label}</SiteDetailLabel>
      <Stack
        direction="row"
        sx={{ gap: `${spacing[2]}px`, alignItems: 'flex-start' }}
      >
        <Box sx={{ mt: '3px', display: 'flex', color: color.fg.neutral.muted }}>
          {icon}
        </Box>
        {/* A div, as a value can be more than a line: an address, its floor and its coordinates. */}
        <Typography
          component="div"
          sx={{
            minWidth: 0,
            flex: 1,
            fontSize: displayTextSize[14],
            lineHeight: 1.6,
            color: color.fg.neutral.default,
            overflowWrap: 'anywhere',
          }}
        >
          {children}
        </Typography>
      </Stack>
    </Box>
  );
}
