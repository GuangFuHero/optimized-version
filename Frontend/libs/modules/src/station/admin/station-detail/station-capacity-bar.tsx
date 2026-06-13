'use client';

import { Box, Stack, Typography } from '@mui/material';

import { useStationDetailColorScheme } from './constants';
import type { StationCapacityBarProps } from './types';

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

export function StationCapacityBar({
  label = '人數',
  currentValue,
  totalValue,
  progress,
}: StationCapacityBarProps) {
  const stationDetailPalette = useStationDetailColorScheme();
  const resolvedProgress = clampProgress(
    progress ?? (totalValue > 0 ? (currentValue / totalValue) * 100 : 0),
  );

  return (
    <Stack sx={{ width: '100%', rowGap: '4px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <Typography
          sx={{
            color: stationDetailPalette.bodyText,
            fontSize: 12,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '0.6px',
          }}
        >
          {label}
        </Typography>

        <Typography
          component="div"
          sx={{
            color: stationDetailPalette.heading,
            fontSize: 12,
            lineHeight: '16px',
            fontWeight: 700,
            letterSpacing: '0.6px',
          }}
        >
          <Box component="span">{currentValue}</Box>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {` / ${totalValue}`}
          </Box>
        </Typography>
      </Box>

      <Box
        sx={{
          width: '100%',
          height: 1,
          minHeight: 8,
          borderRadius: '999px',
          overflow: 'hidden',
          bgcolor: stationDetailPalette.capacityTrack,
        }}
      >
        <Box
          sx={{
            width: `${resolvedProgress}%`,
            height: '100%',
            borderRadius: '999px',
            bgcolor: stationDetailPalette.capacityFill,
          }}
        />
      </Box>
    </Stack>
  );
}
