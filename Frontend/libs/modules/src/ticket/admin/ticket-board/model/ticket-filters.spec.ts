import { describe, expect, it } from 'vitest';

import {
  countActiveFilters,
  differsOnlyIn,
  listsEveryTicket,
  NEED_FILTER_TYPES,
  EMPTY_TICKET_FILTERS,
  pageCountOf,
  parseTicketFilters,
  parseTicketPage,
  passesTimeFilter,
  ticketFiltersKey,
  ticketTimeCut,
  TICKET_MAP_AREA_KEYS,
  TICKET_PAGE_KEYS,
  toExtentVariables,
  toMapVariables,
  toPageVariables,
  toServerVariables,
  UNASSIGNED_TEAM,
  writeTicketFilters,
} from './ticket-filters';
import { NEED_TYPES } from './ticket-row';

describe('ticket filters', () => {
  it('round-trips through the URL and keeps unrelated params', () => {
    const next = writeTicketFilters(
      new URLSearchParams('view=map&ticket=abc&status=pending'),
      {
        ...parseTicketFilters(new URLSearchParams('status=pending')),
        priority: 'high',
      },
    );
    expect(next.get('view')).toBe('map');
    expect(next.get('ticket')).toBe('abc');
    expect(next.get('status')).toBe('pending');
    expect(next.get('priority')).toBe('high');
    expect(parseTicketFilters(next)).toMatchObject({
      status: 'pending',
      priority: 'high',
    });
  });

  it('drops page whenever filters are written', () => {
    const next = writeTicketFilters(
      new URLSearchParams('page=4'),
      EMPTY_TICKET_FILTERS,
    );
    expect(next.has('page')).toBe(false);
  });

  it('ignores unknown enum values in the URL', () => {
    const f = parseTicketFilters(
      new URLSearchParams('status=bogus&priority=x'),
    );
    expect(f.status).toBeNull();
    expect(f.priority).toBeNull();
  });

  it('sends only a valid keyword', () => {
    expect(
      toServerVariables({ ...EMPTY_TICKET_FILTERS, q: 'a' }).q,
    ).toBeUndefined();
    expect(toServerVariables({ ...EMPTY_TICKET_FILTERS, q: ' 淹水 ' }).q).toBe(
      '淹水',
    );
  });

  it('maps taskType and the area onto needType, county and town', () => {
    expect(
      toServerVariables({
        ...EMPTY_TICKET_FILTERS,
        status: 'pending',
        priority: 'high',
        taskType: 'supply',
        county: '花蓮縣',
        town: '光復鄉',
      }),
    ).toEqual({
      status: 'pending',
      priority: 'high',
      needType: 'supply',
      county: '花蓮縣',
      town: '光復鄉',
    });
    expect(toServerVariables(EMPTY_TICKET_FILTERS)).toEqual({});
  });

  it('sends a team as its 責任區, and 未指派 as unassignedOnly', () => {
    expect(toServerVariables({ ...EMPTY_TICKET_FILTERS, team: 't-1' })).toEqual(
      { responsibleTeamUuid: 't-1' },
    );
    expect(
      toServerVariables({ ...EMPTY_TICKET_FILTERS, team: UNASSIGNED_TEAM }),
    ).toEqual({ unassignedOnly: true });
  });

  it('cuts 時間 24 hours back, rounded down to 5 minutes', () => {
    const now = Date.parse('2026-11-03T10:07:30Z');
    expect(ticketTimeCut(now)).toBe('2026-11-02T10:05:00.000Z');
    expect(
      toServerVariables({ ...EMPTY_TICKET_FILTERS, time: 'today' }, now),
    ).toEqual({ updatedAfter: '2026-11-02T10:05:00.000Z' });
    expect(
      toServerVariables({ ...EMPTY_TICKET_FILTERS, time: 'earlier' }, now),
    ).toEqual({ updatedBefore: '2026-11-02T10:05:00.000Z' });
  });

  it('puts every ticket with a time in exactly one 時間 half', () => {
    const now = Date.parse('2026-11-03T10:07:30Z');
    for (const at of [
      '2026-11-03T09:00:00Z',
      '2026-11-02T10:05:00Z',
      '2026-11-01T00:00:00Z',
    ]) {
      expect(
        passesTimeFilter(at, 'today', now) !==
          passesTimeFilter(at, 'earlier', now),
      ).toBe(true);
    }
    expect(passesTimeFilter(null, 'today', now)).toBe(false);
    expect(passesTimeFilter(null, 'earlier', now)).toBe(false);
  });

  it('round-trips the area, team and time, and drops a town without its county', () => {
    const filters = {
      ...EMPTY_TICKET_FILTERS,
      county: '花蓮縣',
      town: '光復鄉',
      team: UNASSIGNED_TEAM,
      time: 'earlier' as const,
    };
    expect(
      parseTicketFilters(writeTicketFilters(new URLSearchParams(), filters)),
    ).toEqual(filters);
    expect(
      parseTicketFilters(new URLSearchParams('town=光復鄉&time=bogus')),
    ).toMatchObject({ county: null, town: null, time: null });
  });

  it('takes a team from the URL only as a uuid or 未指派, as the server takes no other', () => {
    const uuid = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
    expect(parseTicketFilters(new URLSearchParams(`team=${uuid}`)).team).toBe(
      uuid,
    );
    expect(
      parseTicketFilters(new URLSearchParams(`team=${UNASSIGNED_TEAM}`)).team,
    ).toBe(UNASSIGNED_TEAM);
    expect(parseTicketFilters(new URLSearchParams('team=foo')).team).toBeNull();
    expect(
      toServerVariables(parseTicketFilters(new URLSearchParams('team=foo'))),
    ).toEqual({});
  });

  it('keys the 時間 filter by its choice, so the key holds as the clock moves', () => {
    const filters = { ...EMPTY_TICKET_FILTERS, time: 'today' as const };
    expect(ticketFiltersKey(filters)).toBe(JSON.stringify({ time: 'today' }));
  });

  it('counts active filters, not the keyword; an area counts once', () => {
    expect(
      countActiveFilters({
        ...EMPTY_TICKET_FILTERS,
        status: 'pending',
        q: 'xx',
      }),
    ).toBe(1);
    expect(
      countActiveFilters({
        ...EMPTY_TICKET_FILTERS,
        county: '花蓮縣',
        town: '光復鄉',
        team: 't-1',
        time: 'today',
      }),
    ).toBe(3);
  });

  it('asks the server for one page of 50, from page 1', () => {
    const filters = { ...EMPTY_TICKET_FILTERS, status: 'pending' as const };
    expect(toPageVariables(filters, 3)).toEqual({
      status: 'pending',
      skip: 100,
      limit: 50,
    });
    expect(toPageVariables(filters, 0)).toMatchObject({ skip: 0 });
    expect(toPageVariables(filters, Number.NaN)).toMatchObject({ skip: 0 });
  });

  it('counts pages from the total, never fewer than one', () => {
    expect(pageCountOf(0)).toBe(1);
    expect(pageCountOf(50)).toBe(1);
    expect(pageCountOf(51)).toBe(2);
  });

  it('asks for the tickets in view, up to 200, with the filters', () => {
    expect(
      toMapVariables(
        { ...EMPTY_TICKET_FILTERS, county: '花蓮縣' },
        {
          west: 121.512345,
          south: 23.912341,
          east: 121.612341,
          north: 24.012349,
          zoom: 13.6,
        },
      ),
    ).toEqual({
      county: '花蓮縣',
      // Snapped outward, so a ticket on the edge of the screen stays in.
      bounds: {
        minLat: 23.9123,
        maxLat: 24.0124,
        minLng: 121.5123,
        maxLng: 121.6124,
      },
      zoom: 14,
      skip: 0,
      limit: 200,
    });
  });

  it('keeps a zoomed-out view inside the globe', () => {
    const { bounds } = toMapVariables(EMPTY_TICKET_FILTERS, {
      west: -250,
      south: -95,
      east: 300,
      north: 95,
      zoom: 1,
    });
    expect(bounds).toEqual({
      minLat: -90,
      maxLat: 90,
      minLng: -180,
      maxLng: 180,
    });
  });

  it('reads ?page= as a whole page number from 1', () => {
    const page = (value: string | null) =>
      parseTicketPage(
        new URLSearchParams(value === null ? '' : `page=${value}`),
      );
    expect(page(null)).toBe(1);
    expect(page('3')).toBe(3);
    expect(page('2.7')).toBe(2);
    expect(page('-2')).toBe(1);
    expect(page('0')).toBe(1);
    expect(page('abc')).toBe(1);
    expect(page('Infinity')).toBe(1);
  });

  it('keeps the last rows only across a page turn', () => {
    const filtered = { ...EMPTY_TICKET_FILTERS, status: 'pending' as const };
    expect(
      differsOnlyIn(
        toPageVariables(filtered, 1),
        toPageVariables(filtered, 2),
        TICKET_PAGE_KEYS,
      ),
    ).toBe(true);
    expect(
      differsOnlyIn(
        toPageVariables(EMPTY_TICKET_FILTERS, 1),
        toPageVariables(filtered, 1),
        TICKET_PAGE_KEYS,
      ),
    ).toBe(false);
    expect(
      differsOnlyIn(
        toPageVariables({ ...EMPTY_TICKET_FILTERS, q: '水電' }, 1),
        toPageVariables({ ...EMPTY_TICKET_FILTERS, q: '淹水' }, 2),
        TICKET_PAGE_KEYS,
      ),
    ).toBe(false);
  });

  it('keeps the last pins only across a move of the map', () => {
    const view = { west: 121, south: 23, east: 121.1, north: 23.1, zoom: 13 };
    const moved = { ...view, west: 121.05, east: 121.15, zoom: 14 };
    expect(
      differsOnlyIn(
        toMapVariables(EMPTY_TICKET_FILTERS, view),
        toMapVariables(EMPTY_TICKET_FILTERS, moved),
        TICKET_MAP_AREA_KEYS,
      ),
    ).toBe(true);
    expect(
      differsOnlyIn(
        toMapVariables(EMPTY_TICKET_FILTERS, view),
        toMapVariables({ ...EMPTY_TICKET_FILTERS, priority: 'high' }, view),
        TICKET_MAP_AREA_KEYS,
      ),
    ).toBe(false);
  });

  it('frames every matching ticket, wherever it is and however many', () => {
    expect(
      toExtentVariables({ ...EMPTY_TICKET_FILTERS, status: 'pending' }),
    ).toEqual({ status: 'pending' });
  });
});

describe('listsEveryTicket', () => {
  it('holds with no filter and no keyword the server takes', () => {
    expect(listsEveryTicket(EMPTY_TICKET_FILTERS)).toBe(true);
    expect(listsEveryTicket({ ...EMPTY_TICKET_FILTERS, q: '水' })).toBe(true);
  });

  it('fails with a filter or a keyword', () => {
    expect(
      listsEveryTicket({ ...EMPTY_TICKET_FILTERS, priority: 'high' }),
    ).toBe(false);
    expect(listsEveryTicket({ ...EMPTY_TICKET_FILTERS, q: '淹水' })).toBe(
      false,
    );
  });
});

describe('NEED_FILTER_TYPES', () => {
  it('lists the design order 搜救 / 人力 / 物資 first, then every other need type once', () => {
    expect(NEED_FILTER_TYPES.slice(0, 3)).toEqual(['rescue', 'hr', 'supply']);
    expect([...NEED_FILTER_TYPES].sort()).toEqual([...NEED_TYPES].sort());
  });

  it('keys the filters as the server takes them, so a keyword too short to send is no new set', () => {
    const pending = { ...EMPTY_TICKET_FILTERS, status: 'pending' as const };
    expect(ticketFiltersKey({ ...pending, q: '水' })).toBe(
      ticketFiltersKey(pending),
    );
    expect(ticketFiltersKey({ ...pending, q: '水管' })).not.toBe(
      ticketFiltersKey(pending),
    );
  });
});
