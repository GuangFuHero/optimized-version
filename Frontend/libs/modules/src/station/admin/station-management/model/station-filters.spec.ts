import { describe, expect, it } from 'vitest';

import {
  applyClientFilters,
  countActiveFilters,
  EMPTY_FILTERS,
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

  it('asks only for stations with pending suggestions when set', () => {
    expect(toServerVariables({ ...EMPTY_FILTERS, pending: true })).toEqual({
      hasPendingSuggestions: true,
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

  it('counts active filters', () => {
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, type: 'water', q: 'x' }),
    ).toBe(1);
  });
});
