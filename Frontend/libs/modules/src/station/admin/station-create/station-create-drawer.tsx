'use client';

import type { AdminStationFieldsFragment } from '@rescue-frontend/data-access/admin';

import type { RescueMapMarkerItem } from '../../../map/types';
import { stationPoint } from '../../station-point';
import { getStationTypeLabel } from '../../type-options';
import { StationFormDrawer } from '../../form';

interface StationCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreatedMarker?: (marker: RescueMapMarkerItem) => void;
  initialPosition?: [number, number] | null;
  onLocationChange?: (position: [number, number]) => void;
}

/** Creating a station from a map: the shared station form, answering with a marker for the map. */
export function StationCreateDrawer({
  open,
  onClose,
  onCreatedMarker,
  initialPosition,
  onLocationChange,
}: StationCreateDrawerProps) {
  return (
    <StationFormDrawer
      target={open ? { mode: 'create', position: initialPosition } : null}
      onClose={onClose}
      onLocationChange={onLocationChange}
      onSaved={(station) => {
        const marker = toCreatedStationMarker(station);
        if (marker) onCreatedMarker?.(marker);
        onClose();
      }}
    />
  );
}

function toCreatedStationMarker(
  station: AdminStationFieldsFragment,
): RescueMapMarkerItem | null {
  const position = stationPoint(station.geometry);
  if (!position) return null;

  const type = station.type?.trim().toLowerCase();
  const typeLabel = getStationTypeLabel(type);
  const name = station.name?.trim();

  return {
    id: station.uuid,
    title: name || station.description?.trim() || typeLabel,
    subtitle:
      station.description?.trim() || station.opHour?.trim() || typeLabel,
    position,
    label: typeLabel,
    variant:
      station.isTemporary || type === 'shelter'
        ? 'pinned-location'
        : 'resource-station',
    detailType: 'station',
    stationMeta: station,
  };
}
