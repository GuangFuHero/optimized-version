import { describe, expect, it } from 'vitest';

import {
  countActiveFilters,
  EMPTY_TICKET_FILTERS,
  pageCountOf,
  parseTicketFilters,
  searchHint,
  toMapVariables,
  toPageVariables,
  toServerVariables,
  writeTicketFilters,
} from './ticket-filters';

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
      new URLSearchParams('status=bogus&priority=x&audit=y'),
    );
    expect(f.status).toBeNull();
    expect(f.priority).toBeNull();
    expect(f.audit).toBeNull();
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

  it('maps taskType, audit and disaster onto needType, auditStatus and disasterType', () => {
    expect(
      toServerVariables({
        ...EMPTY_TICKET_FILTERS,
        status: 'pending',
        priority: 'high',
        taskType: 'supply',
        audit: 'need_audit',
        disaster: 'flood',
      }),
    ).toEqual({
      status: 'pending',
      priority: 'high',
      needType: 'supply',
      auditStatus: 'need_audit',
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
});
