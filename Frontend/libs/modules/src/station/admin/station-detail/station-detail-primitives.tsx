'use client';

import type { ReactNode } from 'react';

import { Box, Typography } from '@mui/material';

import { useStationDetailColorScheme } from './constants';

export function StationDetailIconSlot({
  icon,
  width,
  height,
  color,
}: {
  icon?: ReactNode;
  width: number | string;
  height: number | string;
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
          display: 'block',
          width: '100%',
          height: '100%',
        },
      }}
    >
      {icon}
    </Box>
  );
}

export function StationDetailSectionHeading({ label }: { label: string }) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Box
      sx={{
        width: '100%',
        pb: '5px',
        borderBottom: `1px solid ${stationDetailPalette.border}`,
      }}
    >
      <Typography
        sx={{
          color: stationDetailPalette.sectionText,
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
