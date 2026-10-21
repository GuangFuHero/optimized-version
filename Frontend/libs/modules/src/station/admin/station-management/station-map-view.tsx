'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { useEffect, useMemo, useRef } from 'react';

import { Map } from '../../../map';
import type {
  RescueMapControllerValue,
  RescueMapMarkerItem,
} from '../../../map/types';
import { toStationMarker } from './model/station-marker';
import type { StationRow } from './model/station-row';
import { FreshnessCell, StatusBadge } from './station-cells';
import { StationEmptyState } from './station-table';

const { color, radius, typography } = designTokens;

interface StationMapViewProps {
  rows: StationRow[];
  hasAnyStation: boolean;
  canAdd: boolean;
  now: Date;
  selectedUuid: string | null;
  onSelect: (uuid: string | null) => void;
  onOpenStation: (uuid: string) => void;
  /** Set when the viewer may create stations: a click on the map starts one there. */
  onAddAt?: (position: [number, number]) => void;
}

export function StationMapView({
  rows,
  hasAnyStation,
  canAdd,
  now,
  selectedUuid,
  onSelect,
  onOpenStation,
  onAddAt,
}: StationMapViewProps) {
  const markers = useMemo(
    () =>
      rows
        .map(toStationMarker)
        .filter((m): m is RescueMapMarkerItem => m !== null),
    [rows],
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '40fr 60fr' },
        gap: '12px',
        height: 'max(560px, calc(100vh - 300px))',
      }}
    >
      <Box
        role="listbox"
        aria-label="站點"
        sx={{
          overflow: 'auto',
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          bgcolor: color.bg.neutral.default,
        }}
      >
        {rows.length === 0 ? (
          <StationEmptyState hasAnyStation={hasAnyStation} canAdd={canAdd} />
        ) : (
          rows.map((row) => (
            <StationCard
              key={row.uuid}
              row={row}
              now={now}
              selected={row.uuid === selectedUuid}
              onSelect={() => onSelect(row.uuid)}
              onOpen={() => onOpenStation(row.uuid)}
            />
          ))
        )}
      </Box>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
        }}
      >
        <Map
          markers={markers}
          showScale
          onMapClick={onAddAt}
          stationDetailSecondaryAction={(marker) => ({
            label: '開啟站點細節',
            onClick: () => onOpenStation(marker.id),
          })}
          renderControls={(controller) => (
            <SelectionSync
              controller={controller}
              selectedUuid={selectedUuid}
              onSelect={onSelect}
            />
          )}
        />
      </Box>
    </Box>
  );
}

/** Keeps the list's selection and the map's selected marker in step, both ways. */
function SelectionSync({
  controller,
  selectedUuid,
  onSelect,
}: {
  controller: RescueMapControllerValue;
  selectedUuid: string | null;
  onSelect: (uuid: string | null) => void;
}) {
  const lastFromList = useRef(selectedUuid);
  const { selectedMarkerId, setSelectedMarkerId } = controller;

  useEffect(() => {
    if (selectedUuid !== lastFromList.current) {
      lastFromList.current = selectedUuid;
      setSelectedMarkerId(selectedUuid ?? undefined);
    }
  }, [selectedUuid, setSelectedMarkerId]);

  useEffect(() => {
    const fromMap = selectedMarkerId ?? null;
    if (fromMap !== lastFromList.current) {
      lastFromList.current = fromMap;
      onSelect(fromMap);
    }
  }, [selectedMarkerId, onSelect]);

  return null;
}

function StationCard({
  row,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  row: StationRow;
  now: Date;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <Box
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      sx={{
        display: 'flex',
        gap: '12px',
        p: '12px 16px',
        cursor: 'pointer',
        borderBottom: `1px solid ${color.border.subtle}`,
        borderLeft: `3px solid ${selected ? color.bg.primary.default : 'transparent'}`,
        bgcolor: selected ? color.bg.primary.subtle : 'transparent',
        '&:hover': { bgcolor: selected ? color.bg.primary.subtle : color.bg.neutral.subtle },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={typography.label[400]}>
          {row.name}
        </Typography>
        <Typography
          noWrap
          sx={{ ...typography.body[300], color: color.fg.neutral.subtle, mt: '2px' }}
        >
          {[row.typeLabel, row.area].filter(Boolean).join(' · ')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '4px' }}>
          <Typography
            sx={{
              ...typography.body[300],
              color: row.teamName ? color.fg.neutral.subtle : color.fg.neutral.muted,
            }}
          >
            {row.teamName ?? '未指派'}
          </Typography>
          <FreshnessCell updatedAt={row.updatedAt} now={now} />
        </Box>
        <ButtonBase
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          sx={{
            ...typography.label[300],
            mt: '6px',
            color: color.fg.neutral.subtle,
            textDecoration: 'underline',
          }}
        >
          開啟站點細節 ›
        </ButtonBase>
      </Box>
      <StatusBadge status={row.operationalStatus} />
    </Box>
  );
}
