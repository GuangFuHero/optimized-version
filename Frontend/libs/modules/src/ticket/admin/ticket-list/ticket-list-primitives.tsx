'use client';

import type { ReactNode } from 'react';

import { Box } from '@mui/material';

export const ticketListPalette = {
  canvas: '#FFFFFF',
  headerSurface: '#F6FAFF',
  frameBorder: '#DCC1B1',
  tableBorder: '#DBE3EC',
  heading: '#151C22',
  bodyText: '#564337',
  strongText: '#151C22',
  countSurface: '#F6FAFF',
  countText: '#564337',
  actionSurface: '#FFFFFF',
  actionFilled: '#E3791E',
  actionFilledText: '#4C2200',
  actionHover: '#F6E5D7',
  filterSelected: '#E7EFF7',
  activeBorder: '#954900',
  critical: '#BA1A1A',
  inProgress: '#006685',
  pendingSurface: '#D3DBE3',
  completed: '#15803D',
  warningText: '#954900',
  unverified: '#BA1A1A',
  disputedSurface: '#FFDAD6',
  disputedText: '#93000A',
  verificationSurface: '#DBE3EC',
  paginationIcon: '#564337',
} as const;

export function toPixelValue(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value;
}

export function TicketListIconSlot({
  icon,
  width,
  height,
  color,
}: {
  icon?: ReactNode;
  width: number;
  height: number;
  color: string;
}) {
  if (!icon) {
    return null;
  }

  return (
    <Box
      sx={{
        width,
        height,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        '& > *': {
          width: '100%',
          height: '100%',
        },
        '& svg': {
          width: '100%',
          height: '100%',
          display: 'block',
        },
      }}
    >
      {icon}
    </Box>
  );
}
