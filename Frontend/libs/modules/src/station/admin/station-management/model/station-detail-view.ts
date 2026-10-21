import type { AdminStationQuery } from '@rescue-frontend/data-access/admin';

import { getOperationalStatusMeta } from '../../../operational-status';
import type { StationStatusTone } from '../../station-detail';
import { UNNAMED_STATION } from './station-row';

export type DetailStation = NonNullable<AdminStationQuery['station']>;

/** What the shared `StationDetailDrawer` shows for an admin station, before icons are added. */
export interface StationDetailView {
  title: string;
  address: string;
  status: { label: string; tone: StationStatusTone };
  isOfficial: boolean;
  pendingFieldCount: number;
  contact: {
    name: string;
    note: string;
    methods: { id: 'phone' | 'email'; value: string }[];
  };
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

function contactMethods(station: DetailStation) {
  const methods: StationDetailView['contact']['methods'] = [];
  if (station.contactPhone) {
    methods.push({ id: 'phone', value: station.contactPhone });
  }
  if (station.contactEmail) {
    methods.push({ id: 'email', value: station.contactEmail });
  }
  return methods;
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
    address: formatStationAddress(station) || '未提供地址',
    status: { label: status.label, tone },
    isOfficial: station.source === 'official',
    pendingFieldCount: station.pendingSuggestedFields.length,
    contact: {
      name: station.contactName || '未提供聯絡人',
      note: canViewPii ? '聯絡資訊僅後台可見' : '無個資權限，顯示遮罩值',
      methods: contactMethods(station),
    },
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
