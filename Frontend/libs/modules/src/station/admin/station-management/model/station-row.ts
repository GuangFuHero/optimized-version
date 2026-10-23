import type { AdminStationFieldsFragment } from '@rescue-frontend/data-access/admin';

import type { OperationalStatus } from '../../../operational-status';
import { stationPoint } from '../../../station-point';
import { getStationTypeLabel } from '../../../type-options';

/** Shown wherever a station has no name. */
export const UNNAMED_STATION = '（未命名站點）';

export interface StationRow {
  uuid: string;
  name: string;
  type: string;
  typeLabel: string;
  operationalStatus: OperationalStatus;
  county: string;
  city: string;
  area: string;
  teamUuid: string | null;
  teamName: string | null;
  /** Created from the admin portal (`source === 'official'`); `isOfficial` is never set. */
  isOfficial: boolean;
  createdAt: string | null;
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
    // The schema types it as a plain string; the backend only stores these three values.
    operationalStatus: station.operationalStatus as OperationalStatus,
    county,
    city,
    area: `${county}${city}`,
    teamUuid: station.assignedTeam?.uuid ?? null,
    teamName: station.assignedTeam?.name ?? null,
    isOfficial: station.source === 'official',
    createdAt: station.createdAt ?? null,
    updatedAt: station.updatedAt ?? null,
    position: stationPoint(station.geometry),
    pendingFieldCount: station.pendingSuggestedFields.length,
    raw: station,
  };
}
