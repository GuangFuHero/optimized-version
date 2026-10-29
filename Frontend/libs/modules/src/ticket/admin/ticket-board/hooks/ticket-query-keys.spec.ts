import {
  ticketMapPinsQuery,
  buildingMapQuery,
  buildingMapWriteKeys,
  buildingMapsQuery,
  buildingMapTicketsQuery,
  spaceTicketKeysForWrite,
  ticketQuery,
  ticketsExtentQuery,
  ticketsQuery,
  ticketWriteKeys,
} from '@rescue-frontend/data-access/admin';
import {
  partialMatchKey,
  QueryClient,
  QueryObserver,
} from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

const hits = (keys: unknown[][], queryKey: readonly unknown[]) =>
  keys.some((key) => partialMatchKey(queryKey, key));

describe('ticket write invalidation', () => {
  const keys = ticketWriteKeys('t-1');

  it('makes the lists stale', () => {
    expect(hits(keys, ticketsQuery({ skip: 50, limit: 50 }).queryKey)).toBe(
      true,
    );
  });

  it("makes the map's pins and the filters' extent stale", () => {
    expect(hits(keys, ticketMapPinsQuery({ zoom: 12 }).queryKey)).toBe(true);
    expect(hits(keys, ticketsExtentQuery({ status: 'pending' }).queryKey)).toBe(
      true,
    );
  });

  it("keeps the map's pins apart from the board's pages", () => {
    expect(
      partialMatchKey(
        ticketMapPinsQuery({ zoom: 12 }).queryKey,
        ticketsQuery({ zoom: 12 }).queryKey,
      ),
    ).toBe(false);
  });

  it('never reaches the spaces by itself: those are picked per write', () => {
    expect(hits(keys, buildingMapsQuery({}).queryKey)).toBe(false);
    expect(
      hits(keys, buildingMapTicketsQuery({ buildingMapUuid: 'b-1' }).queryKey),
    ).toBe(false);
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

describe('the spaces a ticket write refreshes', () => {
  // A space works its state out from its tickets, so a write refreshes the spaces it can move —
  // never all of them: the board keeps one tickets query per space mounted.
  function client() {
    const queryClient = new QueryClient();
    for (const [space, ticket] of [
      ['A', 't-1'],
      ['B', 't-2'],
      ['C', 't-3'],
    ]) {
      queryClient.setQueryData(
        buildingMapTicketsQuery({ buildingMapUuid: space }).queryKey,
        { buildingMapTickets: [{ uuid: ticket }] } as never,
      );
    }
    return queryClient;
  }
  const spaces = (keys: unknown[][]) =>
    ['A', 'B', 'C'].filter((space) =>
      hits(keys, buildingMapTicketsQuery({ buildingMapUuid: space }).queryKey),
    );

  it('refreshes only the space holding the written ticket', () => {
    expect(spaces(spaceTicketKeysForWrite(client(), 't-1'))).toEqual(['A']);
    expect(spaces(spaceTicketKeysForWrite(client(), 't-9'))).toEqual([]);
  });

  it('refreshes the space a new household was filed in', () => {
    expect(spaces(spaceTicketKeysForWrite(client(), 't-new', 'B'))).toEqual([
      'B',
    ]);
  });

  it('for a write naming no ticket, refreshes the spaces of the ticket on screen', () => {
    const queryClient = client();
    const detail = ticketQuery({ uuid: 't-3' });
    queryClient.setQueryData(detail.queryKey, { ticket: null } as never);
    const unsubscribe = new QueryObserver(queryClient, {
      queryKey: detail.queryKey,
      queryFn: () => ({ ticket: null }),
      staleTime: Infinity,
    }).subscribe(() => undefined);

    expect(spaces(spaceTicketKeysForWrite(queryClient))).toEqual(['C']);
    unsubscribe();
  });
});

describe('what a space write refreshes', () => {
  const spaceTickets = (uuid: string) =>
    buildingMapTicketsQuery({ buildingMapUuid: uuid }).queryKey;

  it('a new space: only the list, never any space’s tickets', () => {
    const keys = buildingMapWriteKeys('create');

    expect(hits(keys, buildingMapsQuery({}).queryKey)).toBe(true);
    expect(hits(keys, spaceTickets('b-1'))).toBe(false);
  });

  it('an edit: the list and that space, not the tickets of any', () => {
    const keys = buildingMapWriteKeys('update', 'b-1');

    expect(hits(keys, buildingMapsQuery({}).queryKey)).toBe(true);
    expect(hits(keys, buildingMapQuery({ uuid: 'b-1' }).queryKey)).toBe(true);
    expect(hits(keys, buildingMapQuery({ uuid: 'b-2' }).queryKey)).toBe(false);
    expect(hits(keys, spaceTickets('b-1'))).toBe(false);
  });

  it('a deletion: that space and its tickets, and the ticket lists its tickets fall back to', () => {
    const keys = buildingMapWriteKeys('delete', 'b-1');

    expect(hits(keys, spaceTickets('b-1'))).toBe(true);
    expect(hits(keys, spaceTickets('b-2'))).toBe(false);
    expect(hits(keys, ticketsQuery({ skip: 0, limit: 50 }).queryKey)).toBe(
      true,
    );
  });
});
