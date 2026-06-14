'use client';

import type { ReactNode } from 'react';

import { Box, Typography } from '@mui/material';

import {
  useStationListColorScheme,
  type StationListColorScheme,
} from './constants';
import type { StationListStatus } from './types';

export function StationListIconSlot({
  icon,
  size,
  color,
}: {
  icon?: ReactNode;
  size: number;
  color: string;
}) {
  if (!icon) {
    return null;
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        '& > *': { width: '100%', height: '100%' },
        '& svg': { display: 'block', width: '100%', height: '100%' },
      }}
    >
      {icon}
    </Box>
  );
}

function getStatusStyles(
  status: StationListStatus,
  stationListPalette: StationListColorScheme,
) {
  switch (status) {
    case 'limited':
      return {
        label: '資源緊張',
        background: stationListPalette.limitedSurface,
        color: stationListPalette.limitedText,
      };
    case 'offline':
      return {
        label: '離線',
        background: stationListPalette.offlineSurface,
        color: stationListPalette.offlineText,
      };
    default:
      return {
        label: '運作中',
        background: stationListPalette.activeSurface,
        color: stationListPalette.activeText,
      };
  }
}

export function StationStatusBadge({ status }: { status: StationListStatus }) {
  const stationListPalette = useStationListColorScheme();
  const styles = getStatusStyles(status, stationListPalette);

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1,
        py: '3px',
        borderRadius: '999px',
        bgcolor: styles.background,
      }}
    >
      <Typography
        sx={{
          color: styles.color,
          fontSize: 10,
          lineHeight: '14px',
          fontWeight: 700,
          letterSpacing: '0.8px',
          whiteSpace: 'nowrap',
        }}
      >
        {styles.label}
      </Typography>
    </Box>
  );
}

export function StationCapacityMeter({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const stationListPalette = useStationListColorScheme();
  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const tense = progress >= 80;

  return (
    <Box sx={{ width: '100%', minWidth: 120 }}>
      <Typography
        sx={{
          color: stationListPalette.heading,
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 700,
        }}
      >
        {current} / {total}
      </Typography>
      <Box
        sx={{
          mt: 0.5,
          height: 6,
          borderRadius: '999px',
          bgcolor: stationListPalette.divider,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: '999px',
            bgcolor: tense
              ? stationListPalette.danger
              : stationListPalette.cool,
          }}
        />
      </Box>
    </Box>
  );
}
