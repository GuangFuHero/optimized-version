/**
 * A station's detail as the site shows it, read from a map marker (prototype `site-detail.jsx`
 * `StationDetail`, after the 2026-10-25 visual alignment item 6). The back office's map opens the
 * same marker in `station/admin/station-detail`, which stays as it is; this is the site's own.
 */

import type { BadgeTone } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../map/types';
import { readOpHour, resolveStationAvailability } from '../availability';
import { describeSupplyStatus, type SupplyStatusLine } from '../supply-status';

export interface SiteStationChip {
  label: string;
  tone: BadgeTone;
  variant: 'solid' | 'subtle';
  /** 官方 carries the shield, as in the prototype. */
  official?: true;
}

export interface SiteStationDetail {
  title: string;
  typeLabel: string;
  chips: SiteStationChip[];
  /** 「現在能不能去」 in a line: the hours, and whether this hour is one of them. */
  hoursLine: string;
  supply: SupplyStatusLine | null;
  locationNote: string;
  tiles: { type: string; hours: string };
  operator: { official: boolean; name: string; verification: string };
  coordinates: string;
}

type StationMeta = NonNullable<RescueMapMarkerItem['stationMeta']>;

// The prototype's `formatStationStatus`: only a public station checked by a person reads as running
// and verified; the rest say how far they got.
function verificationChip(station: StationMeta): SiteStationChip {
  if (
    station.visibility === 'public' &&
    station.verificationStatus === 'human_verified'
  ) {
    return {
      label: station.isTemporary ? '臨時 · 已人工驗證' : '啟用 · 已人工驗證',
      tone: 'success',
      variant: 'subtle',
    };
  }

  if (station.verificationStatus === 'ai_verified') {
    return { label: 'AI 驗證', tone: 'warning', variant: 'subtle' };
  }

  return {
    label: station.visibility === 'public' ? '公開' : '未驗證',
    tone: 'neutral',
    variant: 'subtle',
  };
}

function formatVerification(status: string | null | undefined): string {
  if (status === 'human_verified') {
    return '人工驗證';
  }

  return status === 'ai_verified' ? 'AI 驗證' : '未驗證';
}

function describeChips(station: StationMeta, now: Date): SiteStationChip[] {
  const availability = resolveStationAvailability(station, now);
  const chips: SiteStationChip[] = [
    { label: availability.headline, tone: availability.tone, variant: 'solid' },
    verificationChip(station),
  ];

  // 官方 and 臨時站點 only when they hold: a chip on every ordinary station would drown the list
  // (prototype site-detail.jsx:211-215). Not `source`, which the site stopped showing (2026-08-21).
  if (station.isOfficial) {
    chips.push({
      label: '官方',
      tone: 'secondary',
      variant: 'subtle',
      official: true,
    });
  }

  if (station.isTemporary) {
    chips.push({ label: '臨時站點', tone: 'neutral', variant: 'subtle' });
  }

  return chips;
}

export function describeSiteStation(
  marker: RescueMapMarkerItem,
  now: Date = new Date(),
): SiteStationDetail {
  const station = marker.stationMeta ?? {};
  const [latitude, longitude] = marker.position;

  return {
    title: marker.title,
    typeLabel: marker.label,
    chips: describeChips(station, now),
    hoursLine: resolveStationAvailability(station, now).detail,
    supply: describeSupplyStatus(
      station.supplyStatus,
      station.supplyStatusUpdatedAt,
      now,
    ),
    // The description only, as the prototype's 位置說明. Never the station's `comment`, the back
    // office's internal note (backend ADR-332), nor the subtitle, which falls back to the hours.
    locationNote: station.description?.trim() || '未提供位置說明',
    tiles: {
      type: marker.label,
      hours: readOpHour(station.opHour) ?? '未提供',
    },
    // 2026-08-21: whether the station is official tells the reader something; its `source` does not.
    operator: {
      official: Boolean(station.isOfficial),
      name: station.isOfficial ? '官方站點' : '一般站點',
      verification: formatVerification(station.verificationStatus),
    },
    coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
}
