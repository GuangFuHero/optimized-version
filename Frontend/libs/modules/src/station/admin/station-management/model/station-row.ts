import type { AdminStationFieldsFragment } from '@rescue-frontend/data-access/admin';

import { getStationTypeLabel } from '../../../type-options';

/** Shown wherever a station has no name. */
export const UNNAMED_STATION = '（未命名站點）';

export interface StationRow {
  uuid: string;
  name: string;
  type: string;
  typeLabel: string;
  operationalStatus: string;
  county: string;
  city: string;
  area: string;
  teamUuid: string | null;
  teamName: string | null;
  /** Created from the admin portal (`source === 'official'`); `isOfficial` is never set. */
  isOfficial: boolean;
  updatedAt: string | null;
  /** [lat, lng] for Leaflet, or null when the station has no point. */
  position: [number, number] | null;
  pendingFieldCount: number;
  raw: AdminStationFieldsFragment;
}

export function toStationRow(station: AdminStationFieldsFragment): StationRow {
  const county = station.secondaryLocation?.county?.trim() ?? '';
  const city = station.secondaryLocation?.city?.trim() ?? '';
  return {
    uuid: station.uuid,
    name: station.name?.trim() || UNNAMED_STATION,
    type: station.type ?? '',
    typeLabel: getStationTypeLabel(station.type),
    operationalStatus: station.operationalStatus,
    county,
    city,
    area: `${county}${city}`,
    teamUuid: station.assignedTeam?.uuid ?? null,
    teamName: station.assignedTeam?.name ?? null,
    isOfficial: station.source === 'official',
    updatedAt: station.updatedAt ?? null,
    position: pointPosition(station.geometry),
    pendingFieldCount: station.pendingSuggestedFields.length,
    raw: station,
  };
}

function pointPosition(geometry: unknown): [number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const { type, coordinates } = geometry as {
    type?: string;
    coordinates?: unknown;
  };
  if (type !== 'Point' || !Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as number[];
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}
