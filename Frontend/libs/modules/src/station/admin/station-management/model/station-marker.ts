import { designTokens } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../../../map/types';
import {
  normalizeStationType,
  STATION_TYPE_OPTIONS,
  type StationTypeValue,
} from '../../../type-options';
import type { StationRow } from './station-row';

const { primitives } = designTokens;
const c = primitives.color;

/**
 * Pin colour per station type on the admin map. The prototype's `TYPE_HEX`
 * (`Design/後台/js/admin/station-v2/station-map.jsx:15-22`) covers shelter, supply, medical, water,
 * charging and other; the types it lacks take neighbouring steps of the same primitive ramps.
 * The map's own legend and pins read this, nothing else — the table's type tone stays its own.
 */
export const STATION_TYPE_PIN_COLORS: Record<StationTypeValue, string> = {
  shelter: '#7B5EA7', // prototype; no violet in our primitives
  supply: c.orange[400],
  medical: c.red[500],
  water: c.blue[400],
  charge: c.amber[500], // prototype `charging`
  shower: c.blue[600],
  toilet: c.neutral[600],
  transport: c.green[500],
  gas_station: c.amber[700],
  power: c.orange[600],
  cellular: c.blue[800],
};

/** Prototype `TYPE_HEX.other`, for a type outside the list. */
export const OTHER_STATION_PIN_COLOR = c.neutral[500];

export function getStationTypePinColor(
  type: string | null | undefined,
): string {
  const key = normalizeStationType(type);
  return (key && STATION_TYPE_PIN_COLORS[key]) || OTHER_STATION_PIN_COLOR;
}

/** Types present in `rows`, in the type list's order, then any unknown ones. */
export function getPresentStationTypes(
  rows: readonly StationRow[],
): { type: string; label: string; color: string }[] {
  const present = new globalThis.Map<string, string>();
  rows.forEach((row) => {
    if (row.position && !present.has(row.type)) {
      present.set(row.type, row.typeLabel);
    }
  });
  const order = STATION_TYPE_OPTIONS.map((option) => option.value as string);
  const rank = (type: string) => {
    const index = order.indexOf(type);
    return index === -1 ? order.length : index;
  };
  return [...present]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([type, label]) => ({
      type,
      label,
      color: getStationTypePinColor(type),
    }));
}

/** Only `active` counts as open; a closed station's pin is faded. */
export function isStationClosed(row: StationRow): boolean {
  return row.operationalStatus !== 'active';
}

/** A map marker for a station, or null when the station has no point. */
export function toStationMarker(
  row: StationRow,
  selected = false,
): RescueMapMarkerItem | null {
  if (!row.position) return null;
  const subtitle = [row.typeLabel, row.area].filter(Boolean).join(' · ');
  return {
    id: row.uuid,
    title: row.name,
    subtitle,
    position: row.position,
    label: row.typeLabel,
    variant: 'resource-station',
    detailType: 'station',
    stationMeta: row.raw,
    pin: {
      color: getStationTypePinColor(row.type),
      dimmed: isStationClosed(row),
      selected,
    },
    tooltip: { title: row.name, subtitle },
  };
}
