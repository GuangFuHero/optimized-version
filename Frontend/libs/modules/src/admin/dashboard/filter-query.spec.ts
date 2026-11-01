import { describe, expect, it } from 'vitest';

import { areaChoices, domainHasArea, filterQuery } from './filter-query';

const ticketAreas = [
  {
    county: '花蓮縣',
    towns: [{ town: '光復鄉', villages: ['大安村', '大馬村'] }],
  },
];
const stationAreas = [
  {
    county: '花蓮縣',
    towns: [
      { town: '光復鄉', villages: ['大進村'] },
      { town: '鳳林鎮', villages: [] },
    ],
  },
  { county: '宜蘭縣', towns: [] },
];
const filters = {
  tickets: { types: [], statuses: [], areas: ticketAreas },
  stations: { types: [], statuses: [], areas: stationAreas },
};

describe('areaChoices', () => {
  it('offers every 縣市 either section has, the tickets first, and nothing below until one is picked', () => {
    expect(areaChoices(filters, {})).toEqual({
      counties: ['花蓮縣', '宜蘭縣'],
      towns: [],
      villages: [],
    });
  });

  it('offers the towns and 村里 of both sections under what is picked', () => {
    expect(areaChoices(filters, { county: '花蓮縣' }).towns).toEqual([
      '光復鄉',
      '鳳林鎮',
    ]);
    expect(
      areaChoices(filters, { county: '花蓮縣', town: '光復鄉' }).villages,
    ).toEqual(['大安村', '大馬村', '大進村']);
  });

  it('offers nothing before the catalog loads', () => {
    expect(areaChoices(undefined, {})).toEqual({
      counties: [],
      towns: [],
      villages: [],
    });
  });
});

describe('domainHasArea', () => {
  it('holds for no area, and for an area its own catalog lists', () => {
    expect(domainHasArea(ticketAreas, {})).toBe(true);
    expect(
      domainHasArea(ticketAreas, {
        county: '花蓮縣',
        town: '光復鄉',
        village: '大安村',
      }),
    ).toBe(true);
  });

  it('fails for an area only the other section has, which would be a 422', () => {
    expect(domainHasArea(ticketAreas, { county: '宜蘭縣' })).toBe(false);
    expect(
      domainHasArea(ticketAreas, { county: '花蓮縣', town: '鳳林鎮' }),
    ).toBe(false);
    expect(
      domainHasArea(ticketAreas, {
        county: '花蓮縣',
        town: '光復鄉',
        village: '大進村',
      }),
    ).toBe(false);
  });
});

describe('filterQuery', () => {
  const area = { county: '花蓮縣', town: '光復鄉', village: '大安村' };

  it("sends the area, and the section's type under its domain's name", () => {
    expect(
      filterQuery('tickets', area, { type: 'rescue' }, 'total_tickets'),
    ).toEqual({ ...area, task_type: 'rescue' });
    expect(
      filterQuery('stations', {}, { type: 'supply' }, 'station_count'),
    ).toEqual({ station_type: 'supply' });
  });

  it('keeps the volunteer metrics off the status filter, and nothing else', () => {
    const section = { type: 'rescue', status: 'pending' };
    expect(filterQuery('tickets', {}, section, 'unassigned_tickets')).toEqual({
      task_type: 'rescue',
      status: 'pending',
    });
    expect(filterQuery('tickets', {}, section, 'volunteer_gap')).toEqual({
      task_type: 'rescue',
    });
  });

  it('sends nothing when nothing is filtered', () => {
    expect(filterQuery('tickets', {}, {}, 'total_tickets')).toEqual({});
  });
});
