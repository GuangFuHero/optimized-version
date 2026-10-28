import { describe, expect, it } from 'vitest';

import {
  applyClientFilters,
  countActiveFilters,
  EMPTY_TICKET_FILTERS,
  pageOf,
  parseTicketFilters,
  searchHint,
  toServerVariables,
  writeTicketFilters,
} from './ticket-filters';
import type { TicketRow } from './ticket-row';

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

  it('maps taskType and audit onto needType and auditStatus', () => {
    expect(
      toServerVariables({
        ...EMPTY_TICKET_FILTERS,
        status: 'pending',
        priority: 'high',
        taskType: 'supply',
        audit: 'need_audit',
      }),
    ).toEqual({
      status: 'pending',
      priority: 'high',
      needType: 'supply',
      auditStatus: 'need_audit',
    });
    expect(toServerVariables(EMPTY_TICKET_FILTERS)).toEqual({});
  });

  it('filters disaster on the client', () => {
    const rows = [
      { uuid: 'a', disasterTypes: ['flood'] },
      { uuid: 'b', disasterTypes: ['quake'] },
    ] as TicketRow[];
    expect(
      applyClientFilters(rows, {
        ...EMPTY_TICKET_FILTERS,
        disaster: 'flood',
      }).map((r) => r.uuid),
    ).toEqual(['a']);
    expect(applyClientFilters(rows, EMPTY_TICKET_FILTERS)).toHaveLength(2);
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

  it('clamps the page', () => {
    expect(pageOf(Array(120).fill(0), 9)).toMatchObject({
      page: 3,
      pageCount: 3,
    });
    expect(pageOf([], 1)).toMatchObject({ page: 1, pageCount: 1, items: [] });
    expect(pageOf(Array(120).fill(0), 3).items).toHaveLength(20);
  });
});
