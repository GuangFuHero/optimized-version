import type { AdminStationQuery } from '@rescue-frontend/data-access/admin';

import { stationPoint } from '../../../station-point';
import { getStationTypeLabel } from '../../../type-options';
import { UNNAMED_STATION } from './station-row';

export type DetailStation = NonNullable<AdminStationQuery['station']>;

/** What `StationDetailSheet` shows for a station, ready to render. */
export interface StationDetailView {
  title: string;
  typeLabel: string;
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
  /** 群眾評分 per resource, only the resources someone has rated. */
  ratings: { id: string; label: string; counts: RatingCounts }[];
}

export interface RatingCounts {
  up: number;
  neutral: number;
  down: number;
}

/** Totals of the crowd's 'up' / 'neutral' / 'down' ratings; any other value is not counted. */
export function countRatings(
  ratings: readonly { rating: string }[],
): RatingCounts {
  const counts: RatingCounts = { up: 0, neutral: 0, down: 0 };
  for (const { rating } of ratings) {
    if (rating === 'up' || rating === 'neutral' || rating === 'down') {
      counts[rating] += 1;
    }
  }
  return counts;
}

export function formatStationAddress(station: DetailStation): string {
  const location = station.secondaryLocation;
  if (!location) return '';
  return [
    location.county,
    location.city,
    location.lane,
    location.alley,
    location.no,
    location.floor,
    location.room,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('');
}

function formatDistrict(station: DetailStation): string {
  const location = station.secondaryLocation;
  return [location?.county, location?.city]
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

function contactLine(station: DetailStation): string | null {
  const parts = [station.contactName, station.contactPhone]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(' ・ ') : null;
}

/** `en-CA` formats dates as YYYY-MM-DD. */
const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '—' : isoDate.format(time);
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
    typeLabel: getStationTypeLabel(station.type),
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
    createdDate: formatDate(station.createdAt),
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
    ratings: station.properties
      .filter((property) => property.crowdSourcings.length > 0)
      .map((property) => ({
        id: property.uuid,
        label: property.propertyName,
        counts: countRatings(property.crowdSourcings),
      })),
  };
}
