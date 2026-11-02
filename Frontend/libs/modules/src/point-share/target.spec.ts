import { describe, expect, it } from 'vitest';

import {
  GetLinkedTicketDocument,
  GetTicketDocument,
} from '@rescue-frontend/data-access';

import { createPointShareTarget, fetchTicketShareMarker } from './target';

const station = {
  id: 'station-1',
  title: '光復國小',
  subtitle: '飲水站',
  detailType: 'station' as const,
};

describe('createPointShareTarget', () => {
  it('leaves the base layer to whoever opens the link when the sharer picked none', () => {
    const target = createPointShareTarget({
      marker: station,
      module: 'map',
      state: {},
      origin: 'https://example.test',
    });

    expect(target.url).toBe('https://example.test/map/station?id=station-1');
  });

  it('carries the base layer the sharer picked', () => {
    const target = createPointShareTarget({
      marker: station,
      module: 'map',
      state: { baseLayer: 'nlsc' },
      origin: 'https://example.test',
    });

    expect(target.url).toBe(
      'https://example.test/map/nlsc/station?id=station-1',
    );
  });
});

const MERGED_UUID = 'd0000000-0000-4000-8000-000000000051';
const KEPT_UUID = 'd0000000-0000-4000-8000-000000000052';

/** A ticket as `GetTicket` returns it. The fragments' masking is only in the types. */
function ticket(uuid: string, title: string) {
  return {
    uuid,
    propertyName: null,
    title,
    taskType: 'supply',
    tasks: [],
  };
}

/**
 * A client that answers `GetTicket` from `tickets` (null for any other uuid) and `GetLinkedTicket`
 * from `availability`, recording what it was asked.
 */
function fakeClient({
  tickets = {},
  availability = {},
}: {
  tickets?: Record<string, ReturnType<typeof ticket>>;
  availability?: Record<
    string,
    { status: string; replacedByUuid: string | null }
  >;
}) {
  const asked: string[] = [];
  const client = {
    query: (document: unknown, variables: { uuid: string }) => {
      const { uuid } = variables;
      const data =
        document === GetTicketDocument
          ? { ticket: tickets[uuid] ?? null }
          : document === GetLinkedTicketDocument
            ? {
                ticket: null,
                ticketAvailability: availability[uuid] ?? {
                  status: 'not_found',
                  replacedByUuid: null,
                },
              }
            : undefined;

      asked.push(
        `${document === GetTicketDocument ? 'GetTicket' : 'GetLinkedTicket'} ${uuid}`,
      );

      return { toPromise: () => Promise.resolve({ data }) };
    },
  };

  return { client: client as never, asked };
}

describe('fetchTicketShareMarker', () => {
  it('names a ticket that is there, asking once', async () => {
    const { client, asked } = fakeClient({
      tickets: { [KEPT_UUID]: ticket(KEPT_UUID, '大進國小禮堂缺飲水') },
    });

    await expect(
      fetchTicketShareMarker(client, KEPT_UUID),
    ).resolves.toMatchObject({
      id: KEPT_UUID,
      title: '大進國小禮堂缺飲水',
      detailType: 'ticket',
    });
    expect(asked).toEqual([`GetTicket ${KEPT_UUID}`]);
  });

  it('names a ticket merged into another by the one it now lives in, as the page opens it', async () => {
    const { client, asked } = fakeClient({
      tickets: { [KEPT_UUID]: ticket(KEPT_UUID, '大進國小禮堂缺飲水') },
      availability: {
        [MERGED_UUID]: { status: 'merged', replacedByUuid: KEPT_UUID },
      },
    });

    await expect(
      fetchTicketShareMarker(client, MERGED_UUID),
    ).resolves.toMatchObject({ id: KEPT_UUID, title: '大進國小禮堂缺飲水' });
    expect(asked).toEqual([
      `GetTicket ${MERGED_UUID}`,
      `GetLinkedTicket ${MERGED_UUID}`,
      `GetTicket ${KEPT_UUID}`,
    ]);
  });

  it('names nothing for a ticket deleted or never there, as the page names the list then', async () => {
    const { client } = fakeClient({
      availability: {
        [MERGED_UUID]: { status: 'deleted', replacedByUuid: null },
      },
    });

    await expect(
      fetchTicketShareMarker(client, MERGED_UUID),
    ).resolves.toBeNull();
    await expect(fetchTicketShareMarker(client, KEPT_UUID)).resolves.toBeNull();
  });
});
