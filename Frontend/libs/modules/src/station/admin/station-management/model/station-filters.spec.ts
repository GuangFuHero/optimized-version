import { describe, expect, it } from 'vitest';

import {
  applyClientFilters,
  areaOptions,
  countActiveFilters,
  EMPTY_FILTERS,
  establishedIn,
  parseStationFilters,
  toServerVariables,
  writeStationFilters,
} from './station-filters';
import type { StationRow } from './station-row';

const now = new Date('2026-10-21T12:00:00Z');
const row = (patch: Partial<StationRow>): StationRow =>
  ({
    uuid: 'x',
    operationalStatus: 'active',
    isOfficial: false,
    updatedAt: now.toISOString(),
    ...patch,
  }) as StationRow;

describe('URL round trip', () => {
  it('keeps unrelated params and drops empty ones', () => {
    const params = new URLSearchParams('view=map&station=abc&type=water');
    const filters = {
      ...parseStationFilters(params),
      official: 'yes' as const,
      type: null,
    };
    const out = writeStationFilters(params, filters);
    expect(out.get('view')).toBe('map');
    expect(out.get('station')).toBe('abc');
    expect(out.get('type')).toBeNull();
    expect(out.get('official')).toBe('yes');
  });

  it('round-trips the area', () => {
    const out = writeStationFilters(new URLSearchParams(), {
      ...EMPTY_FILTERS,
      area: '花蓮縣光復鄉',
    });
    expect(parseStationFilters(out).area).toBe('花蓮縣光復鄉');
  });

  it('ignores invalid values', () => {
    const filters = parseStationFilters(
      new URLSearchParams('status=bogus&official=maybe&fresh=old'),
    );
    expect(filters).toEqual(EMPTY_FILTERS);
  });
});

describe('toServerVariables', () => {
  it('maps team and keyword', () => {
    expect(
      toServerVariables({ ...EMPTY_FILTERS, team: '__none__', q: ' a ' }),
    ).toEqual({ unassignedOnly: true });
    expect(
      toServerVariables({ ...EMPTY_FILTERS, team: 't1', q: '光復' }),
    ).toEqual({ assignedTeamUuid: 't1', q: '光復' });
  });

  it('asks only for pending stations the caller can review when set', () => {
    expect(toServerVariables({ ...EMPTY_FILTERS, pending: true })).toEqual({
      hasPendingSuggestions: true,
      reviewableOnly: true,
    });
  });
});

describe('applyClientFilters', () => {
  it('filters official and freshness, then sorts active first and newest first', () => {
    const rows = [
      row({ uuid: 'old', updatedAt: '2026-10-17T12:00:00Z', isOfficial: true }),
      row({
        uuid: 'closed',
        operationalStatus: 'temporarily_closed',
        isOfficial: true,
      }),
      row({ uuid: 'new', isOfficial: true }),
      row({ uuid: 'user', isOfficial: false }),
      row({ uuid: 'never', updatedAt: null, isOfficial: true }),
    ];
    expect(
      applyClientFilters(rows, { ...EMPTY_FILTERS, official: 'yes' }, now).map(
        (r) => r.uuid,
      ),
    ).toEqual(['new', 'old', 'never', 'closed']);
    expect(
      applyClientFilters(
        rows,
        { ...EMPTY_FILTERS, freshness: 'expired' },
        now,
      ).map((r) => r.uuid),
    ).toEqual(['old']);
  });

  it('filters by area client-side and lists each loaded area once', () => {
    const rows = [
      row({ uuid: 'a', area: '花蓮縣光復鄉' }),
      row({ uuid: 'b', area: '花蓮縣鳳林鎮' }),
      row({ uuid: 'c', area: '花蓮縣光復鄉' }),
      row({ uuid: 'd', area: '' }),
    ];
    expect(
      applyClientFilters(rows, { ...EMPTY_FILTERS, area: '花蓮縣光復鄉' }, now)
        .map((r) => r.uuid)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(areaOptions(rows)).toHaveLength(2);
    expect(areaOptions(rows)).toContain('花蓮縣鳳林鎮');
  });

  it('counts active filters', () => {
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, type: 'water', q: 'x' }),
    ).toBe(1);
  });

  it('splits stations by the disaster week they were set up in', () => {
    const start = '2026-10-01T12:00:00+08:00';
    expect(establishedIn('2026-10-01T15:00:00+08:00', start)).toBe(
      'first_week',
    );
    expect(establishedIn('2026-10-07T12:00:00+08:00', start)).toBe(
      'first_week',
    );
    expect(establishedIn('2026-10-08T12:00:00+08:00', start)).toBe('later');
    expect(establishedIn(null, start)).toBeNull();
    expect(establishedIn('2026-10-08T12:00:00+08:00', null)).toBeNull();

    const rows = [
      row({ uuid: 'early', createdAt: '2026-10-02T12:00:00+08:00' }),
      row({ uuid: 'late', createdAt: '2026-10-15T12:00:00+08:00' }),
      row({ uuid: 'unknown', createdAt: null }),
    ];
    const pick = (
      established: 'first_week' | 'later',
      started: string | null,
    ) =>
      applyClientFilters(rows, { ...EMPTY_FILTERS, established }, now, started)
        .map((r) => r.uuid)
        .sort();
    expect(pick('first_week', start)).toEqual(['early']);
    expect(pick('later', start)).toEqual(['late']);
    // Without a start date the filter can't apply, so nothing is hidden.
    expect(pick('later', null)).toEqual(['early', 'late', 'unknown']);
  });

  it('round-trips the 成立 filter through the URL', () => {
    const out = writeStationFilters(new URLSearchParams(), {
      ...EMPTY_FILTERS,
      established: 'later',
    });
    expect(out.get('est')).toBe('later');
    expect(parseStationFilters(out).established).toBe('later');
  });
});
