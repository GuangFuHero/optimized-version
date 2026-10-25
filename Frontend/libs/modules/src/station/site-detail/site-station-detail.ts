/**
 * A station's detail as the site shows it, read from a map marker (prototype `site-detail.jsx`
 * `StationDetail`, after the 2026-10-25 visual alignment item 6 and the designer's answers of
 * 2026-10-26). The back office's map opens the same marker in `station/admin/station-detail`, which
 * stays as it is; this is the site's own.
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
  /** 目前缺少: what the station is short of. Null when it says nothing, and the block goes. */
  supply: SupplyStatusLine | null;
  locationNote: string;
  tiles: { type: string; hours: string };
  coordinates: string;
}

type StationMeta = NonNullable<RescueMapMarkerItem['stationMeta']>;

// Within a day the line reads 「3 小時前更新」, older 「10/24 更新」 (designer, 2026-10-26): how fresh a
// line is matters while it is fresh; past a day, a date is quicker to read than a count of days.
const SUPPLY_RELATIVE_WITHIN = 24 * 60 * 60_000;

function describeChips(station: StationMeta, now: Date): SiteStationChip[] {
  const availability = resolveStationAvailability(station, now);
  // No verification chip (designer, 2026-10-26): nothing in the backend sets a station's
  // verification yet — not creating, editing, reviewing nor importing one — so it would say the same
  // of every station. Back with a verification flow.
  const chips: SiteStationChip[] = [
    { label: availability.headline, tone: availability.tone, variant: 'solid' },
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
      { relativeWithin: SUPPLY_RELATIVE_WITHIN },
    ),
    // The description only, as the prototype's 位置說明. Never the station's `comment`, the back
    // office's internal note (backend ADR-332), nor the subtitle, which falls back to the hours.
    locationNote: station.description?.trim() || '未提供位置說明',
    tiles: {
      type: marker.label,
      hours: readOpHour(station.opHour) ?? '未提供',
    },
    coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
}
