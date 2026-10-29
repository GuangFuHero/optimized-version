import {
  ticketQuery,
  ticketsQuery,
  ticketStatsQuery,
  ticketWriteKeys,
} from '@rescue-frontend/data-access/admin';
import { partialMatchKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

const hits = (keys: unknown[][], queryKey: readonly unknown[]) =>
  keys.some((key) => partialMatchKey(queryKey, key));

describe('ticket write invalidation', () => {
  const keys = ticketWriteKeys('t-1');

  it('makes the lists and the stats stale', () => {
    expect(hits(keys, ticketsQuery({ skip: 50, limit: 50 }).queryKey)).toBe(
      true,
    );
    expect(hits(keys, ticketStatsQuery().queryKey)).toBe(true);
  });

  it("makes only the written ticket's detail stale", () => {
    expect(hits(keys, ticketQuery({ uuid: 't-1' }).queryKey)).toBe(true);
    expect(hits(keys, ticketQuery({ uuid: 't-2' }).queryKey)).toBe(false);
  });

  it("reaches that ticket's history, whatever page of it is open", () => {
    expect(
      hits(keys, [
        'admin',
        'tickets',
        'TicketHistory',
        { path: { uuid: 't-1' }, query: { limit: 20 } },
      ]),
    ).toBe(true);
  });

  it('without a ticket uuid, reaches every detail', () => {
    expect(hits(ticketWriteKeys(), ticketQuery({ uuid: 't-2' }).queryKey)).toBe(
      true,
    );
  });
});
