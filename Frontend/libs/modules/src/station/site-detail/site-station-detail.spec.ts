import { describe, expect, it } from 'vitest';

import type { RescueMapMarkerItem } from '../../map/types';
import { describeSiteStation } from './site-station-detail';

// A moment given in Taiwan's time (UTC+8, no daylight saving), whatever zone the test runs in.
const at = (hours: number, minutes = 0) =>
  new Date(Date.UTC(2026, 9, 25, hours - 8, minutes));

function station(
  meta: RescueMapMarkerItem['stationMeta'] = {},
  overrides: Partial<RescueMapMarkerItem> = {},
): RescueMapMarkerItem {
  return {
    id: 's-1',
    title: '光復國小供水站',
    subtitle: '06:00-22:00',
    position: [23.6694, 121.4212],
    label: '加水',
    variant: 'resource-station',
    detailType: 'station',
    stationMeta: {
      type: 'water',
      description: '校門口設 6 座取水口，可接軟管',
      opHour: '06:00-22:00',
      visibility: 'public',
      verificationStatus: 'human_verified',
      isOfficial: true,
      isTemporary: false,
      operationalStatus: 'active',
      ...meta,
    },
    ...overrides,
  };
}

describe('describeSiteStation', () => {
  it('heads an official station that is open now with its name, its kind and its chips', () => {
    const detail = describeSiteStation(station(), at(10));

    expect(detail.title).toBe('光復國小供水站');
    expect(detail.typeLabel).toBe('加水');
    expect(detail.chips).toEqual([
      { label: '現在開放', tone: 'success', variant: 'solid' },
      { label: '官方', tone: 'secondary', variant: 'subtle', official: true },
    ]);
  });

  it('says when a station is resting or has paused, from its hours and its status', () => {
    expect(describeSiteStation(station(), at(23)).chips[0]).toEqual({
      label: '休息中',
      tone: 'neutral',
      variant: 'solid',
    });
    expect(
      describeSiteStation(
        station({ operationalStatus: 'temporarily_closed' }),
        at(10),
      ).chips[0],
    ).toEqual({ label: '暫停服務', tone: 'warning', variant: 'solid' });
  });

  it('marks a temporary station once, with a chip of its own', () => {
    const labels = describeSiteStation(
      station({ isTemporary: true, isOfficial: false }),
      at(10),
    ).chips.map((chip) => chip.label);

    expect(labels).toEqual(['現在開放', '臨時站點']);
  });

  it('shows no verification, which nothing in the backend sets yet, and no 官方 on an ordinary one', () => {
    const labels = (meta: RescueMapMarkerItem['stationMeta']) =>
      describeSiteStation(
        station({ isOfficial: false, ...meta }),
        at(10),
      ).chips.map((chip) => chip.label);

    expect(labels({ verificationStatus: 'human_verified' })).toEqual([
      '現在開放',
    ]);
    expect(labels({ verificationStatus: 'ai_verified' })).toEqual(['現在開放']);
    expect(
      labels({ visibility: 'restricted', verificationStatus: null }),
    ).toEqual(['現在開放']);
  });

  it('lays out the body in the prototype order: hours, place, where, with no tiles repeating them', () => {
    const detail = describeSiteStation(station(), at(10));

    expect(detail.hoursLine).toBe('服務時間 06:00-22:00');
    expect(detail.locationNote).toBe('校門口設 6 座取水口，可接軟管');
    expect(detail.coordinates).toBe('23.669400, 121.421200');
    // The hours line already says the hours, and the type sits under the title (designer, 2026-10-26).
    expect(detail).not.toHaveProperty('tiles');
  });

  it('says what is missing rather than leaving a gap, and never falls back to the internal comment', () => {
    const detail = describeSiteStation(
      station({
        description: '  ',
        opHour: 'unknown',
        comment: '後台備註：鑰匙在警衛室',
        isOfficial: false,
        verificationStatus: 'ai_verified',
      }),
      at(10),
    );

    expect(detail.hoursLine).toBe('服務時間未提供');
    expect(detail.locationNote).toBe('未提供位置說明');
  });

  it('carries what the station is short of, with when it was last said, and nothing when it says nothing', () => {
    const short = (updatedAt: Date) =>
      describeSiteStation(
        station({
          supplyStatus: '飲用水、嬰兒尿布',
          supplyStatusUpdatedAt: updatedAt.toISOString(),
        }),
        at(11),
      ).supply;

    expect(short(at(8))).toEqual({
      text: '飲用水、嬰兒尿布',
      updated: '3 小時前更新',
    });
    // A day old or more, the date (designer, 2026-10-26).
    expect(short(new Date(Date.UTC(2026, 9, 23, 0)))?.updated).toBe(
      '10/23 更新',
    );
    expect(describeSiteStation(station(), at(10)).supply).toBeNull();
  });
});
