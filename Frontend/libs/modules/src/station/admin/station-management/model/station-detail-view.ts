import type { AdminStationQuery } from '@rescue-frontend/data-access/admin';

import { taiwanDateParts } from '../../../../time';
import { stationPoint } from '../../../station-point';
import { UNNAMED_STATION } from './station-row';

export type DetailStation = NonNullable<AdminStationQuery['station']>;

/** What `StationDetailSheet` shows for a station, ready to render. */
export interface StationDetailView {
  title: string;
  /** 行政區: county and township, e.g. 花蓮縣光復鄉. */
  district: string;
  address: string;
  /** `lat, lng`, or null without a point. */
  coordinates: string | null;
  isOfficial: boolean;
  verification: { verified: boolean; label: string };
  pendingFieldCount: number;
  contact: {
    /** 「name ・ phone」, whichever the station has; null with neither. */
    line: string | null;
    email: string | null;
    /** Said only when the values are masked (no view_pii). */
    maskedNote: string | null;
  };
  /** 成立時間 as YYYY-MM-DD (Taipei), or '—'. */
  createdDate: string;
  resources: { id: string; label: string; value: string }[];
}

export function formatStationAddress(station: DetailStation): string {
  const location = station.secondaryLocation;
  if (!location) return '';
  return [location.fullAddress, location.floor, location.room]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('');
}

function formatDistrict(station: DetailStation): string {
  const location = station.secondaryLocation;
  return [location?.county, location?.town]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('');
}

function formatCoordinates(station: DetailStation): string | null {
  const point = stationPoint(station.geometry);
  return point ? `${point[0].toFixed(3)}, ${point[1].toFixed(3)}` : null;
}

const VERIFICATION_LABELS: Record<string, string> = {
  human_verified: '人工驗證',
  ai_verified: 'AI 驗證',
};

/** `verificationStatus` is 'unverified', 'ai_verified' or 'human_verified'. */
function verification(station: DetailStation) {
  const label = VERIFICATION_LABELS[station.verificationStatus ?? ''];
  return label
    ? { verified: true, label }
    : { verified: false, label: '未驗證' };
}

/** The day a station was set up, as the design's 成立時間 shows it: 「2026-09-30」, in Taiwan time. */
function formatCreatedDate(iso: string | null | undefined): string {
  const time = iso ? new Date(iso) : null;
  if (!time || Number.isNaN(time.getTime())) return '—';
  const { year, month, day } = taiwanDateParts(time);
  return `${year}-${month}-${day}`;
}

function contactLine(station: DetailStation): string | null {
  const parts = [station.contactName, station.contactPhone]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(' ・ ') : null;
}

/**
 * The footer caption on a station the viewer cannot edit. A role that edits stations but not
 * this one is `team`-scoped (WG-168), so name the team the station is not assigned to.
 */
export function readOnlyCaption({
  canEditStations,
  teamName,
}: {
  canEditStations: boolean;
  teamName: string | null;
}): string {
  return canEditStations && teamName
    ? `此站點未指派給 ${teamName}，僅可檢視`
    : '此角色為唯讀檢視';
}

export function toStationDetailView(
  station: DetailStation,
  { canViewPii }: { canViewPii: boolean },
): StationDetailView {
  return {
    title: station.name?.trim() || UNNAMED_STATION,
    district: formatDistrict(station) || '—',
    address: formatStationAddress(station) || '未提供地址',
    coordinates: formatCoordinates(station),
    isOfficial: station.source === 'official',
    verification: verification(station),
    pendingFieldCount: station.pendingSuggestedFields.length,
    contact: {
      line: contactLine(station),
      email: station.contactEmail?.trim() || null,
      maskedNote: canViewPii ? null : '無個資權限，顯示遮罩值',
    },
    createdDate: formatCreatedDate(station.createdAt),
    resources: station.properties.map((property) => {
      const quantity =
        property.quantity == null ? '—' : String(property.quantity);
      return {
        id: property.uuid,
        label: property.propertyName,
        value: property.comment
          ? `${quantity}（${property.comment}）`
          : quantity,
      };
    }),
  };
}
