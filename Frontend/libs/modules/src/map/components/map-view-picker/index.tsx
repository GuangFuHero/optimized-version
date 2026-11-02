'use client';

import { Box } from '@mui/material';
import dynamic from 'next/dynamic';

import { designTokens } from '@rescue-frontend/ui';

import type { MapViewPickerRequest, MapViewValue } from './types';

export type { MapViewPickerRequest, MapViewValue };

const { color, radius } = designTokens;

const MapViewPickerCanvas = dynamic(
  () =>
    import('./map-view-picker-canvas').then(
      (module) => module.MapViewPickerCanvas,
    ),
  { ssr: false },
);

interface MapViewPickerProps {
  /** The map's name for a screen reader: Leaflet makes it a tab stop. */
  label: string;
  /** Where the map opens. Read once: later changes move nothing, `request` does. */
  initial: MapViewValue;
  editable: boolean;
  onMove: (view: MapViewValue) => void;
  request?: MapViewPickerRequest | null;
  height?: number;
}

/**
 * A small map to choose a view by: what is saved is the centre of what it shows and its zoom, so a
 * ring marks the centre (prototype `st-app.jsx` `MapViewRow`). Nobody types a latitude.
 */
export function MapViewPicker({
  label,
  initial,
  editable,
  onMove,
  request = null,
  height = 260,
}: MapViewPickerProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        height,
        borderRadius: `${radius.md}px`,
        overflow: 'hidden',
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.sunken,
      }}
    >
      <MapViewPickerCanvas
        label={label}
        initial={initial}
        editable={editable}
        onMove={onMove}
        request={request}
      />
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 18,
          height: 18,
          ml: '-9px',
          mt: '-9px',
          zIndex: 500,
          pointerEvents: 'none',
          borderRadius: `${radius.full}px`,
          border: `2px solid ${color.brand.primary.default}`,
          boxShadow: `0 0 0 2px ${color.bg.neutral.default}`,
        }}
      />
    </Box>
  );
}
