'use client';

import { Box, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Map } from '../../../map';
import type {
  RescueMapControllerValue,
  RescueMapMarkerItem,
} from '../../../map/types';
import {
  TICKET_PRIORITY_PIN_COLORS,
  toTicketMarker,
} from './model/ticket-marker';
import type { TicketPriority, TicketRow } from './model/ticket-row';

const { color, radius, shadow, typography } = designTokens;

const MAP_HEIGHT = 560;
const CLUSTER_MAX_ZOOM = 14;
const OVERLAY_INSET = 12;

const LEGEND: { priority: TicketPriority; label: string }[] = [
  { priority: 'critical', label: '緊急' },
  { priority: 'high', label: '高' },
  { priority: 'medium', label: '中' },
  { priority: 'low', label: '低' },
];

interface TicketMapViewProps {
  rows: TicketRow[];
  selectedUuid: string | null;
  onOpenTicket: (uuid: string) => void;
}

/** Browse-only: pins by priority; a click on a pin opens the ticket, a click on the map does nothing. */
export function TicketMapView({
  rows,
  selectedUuid,
  onOpenTicket,
}: TicketMapViewProps) {
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const markers = useMemo(
    () =>
      rows
        .map((row) => toTicketMarker(row, row.uuid === selectedUuid))
        .filter((m): m is RescueMapMarkerItem => m !== null),
    [rows, selectedUuid],
  );
  useFitTickets(leafletMap, markers);

  return (
    <Box
      sx={{
        position: 'relative',
        height: MAP_HEIGHT,
        overflow: 'hidden',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.lg}px`,
      }}
    >
      <Map
        markers={markers}
        hideDetailDrawer
        showZoomControl
        clusterAppearance="solid"
        clusterMaxZoom={CLUSTER_MAX_ZOOM}
        onMapReady={setLeafletMap}
        renderControls={(controller) => (
          <SelectionSync controller={controller} onOpen={onOpenTicket} />
        )}
      />
      <PriorityLegend />
    </Box>
  );
}

/** Frames the filtered tickets whenever the set of points changes. */
function useFitTickets(
  map: LeafletMap | null,
  markers: readonly RescueMapMarkerItem[],
) {
  const pointsKey = markers
    .map((marker) => `${marker.position[0]},${marker.position[1]}`)
    .join(';');
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    if (!map) return;
    const points = markersRef.current.map((marker) => marker.position);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(points, { padding: [48, 48] });
    }
  }, [map, pointsKey]);
}

/** A picked pin opens its ticket; the selection is cleared so the same pin can be picked again. */
function SelectionSync({
  controller,
  onOpen,
}: {
  controller: RescueMapControllerValue;
  onOpen: (uuid: string) => void;
}) {
  const { selectedMarkerId, setSelectedMarkerId } = controller;
  useEffect(() => {
    if (!selectedMarkerId) return;
    onOpen(selectedMarkerId);
    setSelectedMarkerId(undefined);
  }, [selectedMarkerId, onOpen, setSelectedMarkerId]);
  return null;
}

function PriorityLegend() {
  return (
    <Box
      component="ul"
      aria-label="優先度"
      sx={{
        position: 'absolute',
        zIndex: 500,
        left: OVERLAY_INSET,
        bottom: 24,
        m: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        p: '10px 12px',
        borderRadius: `${radius.md}px`,
        boxShadow: shadow.sm,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Typography
        component="li"
        aria-hidden
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          color: color.fg.neutral.muted,
        }}
      >
        優先度
      </Typography>
      {LEGEND.map(({ priority, label }) => (
        <Box
          component="li"
          key={priority}
          sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Box
            component="span"
            sx={{
              width: 13,
              height: 13,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              bgcolor: TICKET_PRIORITY_PIN_COLORS[priority],
            }}
          />
          <Typography
            component="span"
            sx={{
              ...typography.label[300],
              color: color.fg.neutral.subtle,
            }}
          >
            {label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
