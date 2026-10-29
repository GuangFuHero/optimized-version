/**
 * A station's detail as the site shows it, read from a map marker. The back office's map opens the
 * same marker in `station/admin/station-detail`, which stays as it is; this is the site's own.
 */

import type { StationType } from '@rescue-frontend/data-access';
import type { BadgeProps } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../map/types';
import { resolveStationAvailability } from '../availability';
import { describeSupplyStatus, type SupplyStatusLine } from '../supply-status';

export interface SiteStationChip
  extends Required<Pick<BadgeProps, 'tone' | 'variant'>> {
  label: string;
  /** 官方 carries a shield. */
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
  coordinates: string;
}

/** What the detail reads of a station, as the backend gives it; a marker may carry any of it. */
type SiteStationSource = Partial<
  Pick<
    StationType,
    | 'description'
    | 'isOfficial'
    | 'isTemporary'
    | 'opHour'
    | 'operationalStatus'
    | 'supplyStatus'
    | 'supplyStatusUpdatedAt'
  >
>;

// Within a day the line reads 「3 小時前更新」, older 「10/24 更新」: how fresh a line is matters while
// it is fresh; past a day, a date is quicker to read than a count of days.
const SUPPLY_RELATIVE_WITHIN = 24 * 60 * 60_000;

function describeChips(
  station: SiteStationSource,
  now: Date,
): SiteStationChip[] {
  const availability = resolveStationAvailability(station, now);
  // No verification chip: nothing in the backend sets a station's verification yet — not creating,
  // editing, reviewing nor importing one — so it would say the same of every station. Back with a
  // verification flow.
  const chips: SiteStationChip[] = [
    { label: availability.headline, tone: availability.tone, variant: 'solid' },
  ];

  // 官方 and 臨時站點 only when they hold: a chip on every ordinary station would drown the list. Not
  // `source`: every station is created in the back office, so where one came from tells nothing.
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
  const station: SiteStationSource = marker.stationMeta ?? {};
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
    // The description only. Never the station's `comment`, the back office's internal note, nor the
    // subtitle, which falls back to the hours.
    locationNote: station.description?.trim() || '未提供位置說明',
    // No 站點類型 or 服務時間 tiles: the hours line above already gives the hours, and is the one that
    // says whether one can go now; the type sits under the title.
    coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
}
