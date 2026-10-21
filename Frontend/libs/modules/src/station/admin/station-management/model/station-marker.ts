import type { RescueMapMarkerItem } from '../../../../map/types';
import type { StationRow } from './station-row';

/** A map marker for a station, or null when the station has no point. */
export function toStationMarker(row: StationRow): RescueMapMarkerItem | null {
  if (!row.position) return null;
  return {
    id: row.uuid,
    title: row.name,
    subtitle: [row.typeLabel, row.area].filter(Boolean).join(' · '),
    position: row.position,
    label: row.typeLabel,
    variant: 'resource-station',
    detailType: 'station',
    stationMeta: row.raw,
  };
}
