'use client';

import { Box, Typography } from '@mui/material';

import { useStationDetailColorScheme } from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type { StationResourceItem } from './types';

export interface StationResourceTileProps {
  item: StationResourceItem;
}

export interface StationResourceGridProps {
  items: readonly StationResourceItem[];
}

export function StationResourceTile({ item }: StationResourceTileProps) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Box
      sx={{
        minWidth: 0,
        height: 58,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: '9px',
        borderRadius: '32px',
        bgcolor: stationDetailPalette.cardSurface,
        border: `1px solid ${stationDetailPalette.cardBorder}`,
      }}
    >
      <StationDetailIconSlot
        icon={item.icon}
        width={28}
        height={28}
        color={stationDetailPalette.tabActiveAccent}
      />

      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: stationDetailPalette.bodyText,
            fontSize: 10,
            lineHeight: '12px',
            fontWeight: 700,
            letterSpacing: '0.8px',
          }}
        >
          {item.label}
        </Typography>
        <Typography
          sx={{
            color: stationDetailPalette.heading,
            fontSize: 20,
            lineHeight: '28px',
            fontWeight: 600,
          }}
        >
          {item.value}
        </Typography>
      </Box>
    </Box>
  );
}

export function StationResourceGrid({ items }: StationResourceGridProps) {
  return (
    <Box
      sx={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 1,
      }}
    >
      {items.map((item) => (
        <StationResourceTile key={item.id} item={item} />
      ))}
    </Box>
  );
}
