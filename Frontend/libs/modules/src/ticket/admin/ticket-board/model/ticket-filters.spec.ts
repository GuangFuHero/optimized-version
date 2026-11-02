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
  searchHint,
  TICKET_MAP_AREA_KEYS,
  TICKET_PAGE_KEYS,
  toExtentVariables,
  toMapVariables,
  toPageVariables,
  toServerVariables,
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
    expect(searchHint('a')).toBe('請輸入 2–50 個字');
    expect(searchHint('ab')).toBeNull();
    expect(searchHint('')).toBeNull();
  });

  it('maps taskType and disaster onto needType and disasterType', () => {
    expect(
      toServerVariables({
        ...EMPTY_TICKET_FILTERS,
        status: 'pending',
        priority: 'high',
        taskType: 'supply',
        disaster: 'flood',
      }),
    ).toEqual({
      status: 'pending',
      priority: 'high',
      needType: 'supply',
      disasterType: 'flood',
    });
    expect(toServerVariables(EMPTY_TICKET_FILTERS)).toEqual({});
  });

  it('counts active filters, not the keyword', () => {
    expect(
      countActiveFilters({
        ...EMPTY_TICKET_FILTERS,
        status: 'pending',
        q: 'xx',
      }),
    ).toBe(1);
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
        { ...EMPTY_TICKET_FILTERS, disaster: 'flood' },
        {
          west: 121.512345,
          south: 23.912341,
          east: 121.612341,
          north: 24.012349,
          zoom: 13.6,
        },
      ),
    ).toEqual({
      disasterType: 'flood',
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
});
