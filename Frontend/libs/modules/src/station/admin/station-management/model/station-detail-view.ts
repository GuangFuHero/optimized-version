import type { AdminStationQuery } from '@rescue-frontend/data-access/admin';

import { getOperationalStatusMeta } from '../../../operational-status';
import { getStationTypeLabel } from '../../../type-options';
import type { StationStatusTone } from '../../station-detail';
import { UNNAMED_STATION } from './station-row';

export type DetailStation = NonNullable<AdminStationQuery['station']>;

/** What the shared `StationDetailDrawer` shows for an admin station, before icons are added. */
export interface StationDetailView {
  title: string;
  typeLabel: string;
  /** 行政區: county and township, e.g. 花蓮縣光復鄉. */
  district: string;
  address: string;
  /** `lat, lng`, or null without a point. */
  coordinates: string | null;
  status: { label: string; tone: StationStatusTone };
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

const STATUS_TONES = {
  success: 'active',
  warning: 'warning',
  neutral: 'inactive',
} as const satisfies Record<string, StationStatusTone>;

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
  const point = station.geometry as { coordinates?: number[] } | null;
  const [lng, lat] = point?.coordinates ?? [];
  return lat == null || lng == null
    ? null
    : `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
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

export function toStationDetailView(
  station: DetailStation,
  { canViewPii }: { canViewPii: boolean },
): StationDetailView {
  const status = getOperationalStatusMeta(station.operationalStatus);
  const tone =
    STATUS_TONES[status.tone as keyof typeof STATUS_TONES] ?? 'inactive';

  return {
    title: station.name?.trim() || UNNAMED_STATION,
    typeLabel: getStationTypeLabel(station.type),
    district: formatDistrict(station) || '—',
    address: formatStationAddress(station) || '未提供地址',
    coordinates: formatCoordinates(station),
    status: { label: status.label, tone },
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
  };
}
