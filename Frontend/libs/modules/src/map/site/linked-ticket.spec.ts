import { describe, expect, it } from 'vitest';

import { readLinkedSelection, resolveLinkedTicket } from './linked-ticket';

const UUID = 'd0000000-0000-4000-8000-000000000051';
const KEPT_UUID = 'd0000000-0000-4000-8000-000000000052';

/** `ticketAvailability` as `GetLinkedTicket` selects it. */
function availability(
  status: 'available' | 'merged' | 'deleted' | 'not_found',
  replacedByUuid: string | null = null,
) {
  return { status, replacedByUuid };
}

/** A ticket as `GetLinkedTicket` returns it. The fragment's masking is only in the types. */
function ticket(overrides: Record<string, unknown> = {}) {
  return {
    uuid: UUID,
    propertyName: null,
    geometry: { type: 'Point', coordinates: [121.43, 23.67] },
    locationCell: null,
    title: '五樓501室住戶需要飲用水',
    description: null,
    contactName: '王小明',
    contactEmail: null,
    contactPhone: '0912000000',
    status: 'pending',
    priority: 'high',
    taskType: 'supply',
    auditStatus: 'no_audit',
    createdBy: 'user-1',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as never;
}

describe('resolveLinkedTicket', () => {
  it('opens a ticket the backend gives, whatever the availability beside it', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: {
          ticket: ticket(),
          ticketAvailability: availability('available'),
        },
      }),
    ).toMatchObject({
      kind: 'ticket',
      marker: {
        id: UUID,
        detailType: 'ticket',
        title: '五樓501室住戶需要飲用水',
      },
    });
  });

  it('sends a ticket merged into another on to the one it now lives in', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: {
          ticket: null,
          ticketAvailability: availability('merged', KEPT_UUID),
        },
      }),
    ).toEqual({ kind: 'replace', uuid: KEPT_UUID });
  });

  it('tells merged with no ticket to send it on to as not found, which claims nothing about it', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: null, ticketAvailability: availability('merged') },
      }),
    ).toMatchObject({ kind: 'gone', ticket: { availability: 'not_found' } });
  });

  it('says deleted only when the backend does, carrying the link and nothing of the ticket', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: null, ticketAvailability: availability('deleted') },
      }),
    ).toEqual({
      kind: 'gone',
      ticket: { id: UUID, detailType: 'gone-ticket', availability: 'deleted' },
    });
  });

  it('says not found for a uuid that never was, or one the caller cannot see', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: null, ticketAvailability: availability('not_found') },
      }),
    ).toEqual({
      kind: 'gone',
      ticket: {
        id: UUID,
        detailType: 'gone-ticket',
        availability: 'not_found',
      },
    });
  });

  it('tells a null ticket beside available as not found, which claims nothing about it', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: null, ticketAvailability: availability('available') },
      }),
    ).toMatchObject({ kind: 'gone', ticket: { availability: 'not_found' } });
  });

  it('says neither when the request fails', () => {
    expect(
      resolveLinkedTicket(UUID, { error: new Error('Network error') }),
    ).toEqual({ kind: 'unknown' });
    expect(resolveLinkedTicket(UUID, {})).toEqual({ kind: 'unknown' });
  });

  it('says neither for a ticket with no point to place', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: {
          ticket: ticket({ geometry: null }),
          ticketAvailability: availability('available'),
        },
      }),
    ).toEqual({ kind: 'unknown' });
  });
});

describe('readLinkedSelection', () => {
  const unseenTicket = (selectedId: string) =>
    readLinkedSelection({ selectedId, dataType: 'ticket', seenLoaded: false });

  it('looks up a ticket uuid the loaded pages never held', () => {
    expect(unseenTicket(UUID)).toEqual({ kind: 'look-up' });
  });

  it('lets go of one seen loaded and gone since: a filter or a pan left it out', () => {
    expect(
      readLinkedSelection({
        selectedId: UUID,
        dataType: 'ticket',
        seenLoaded: true,
      }),
    ).toEqual({ kind: 'let-go' });
  });

  it("never looks up a station, nor a guest's location cell", () => {
    expect(
      readLinkedSelection({
        selectedId: UUID,
        dataType: 'station',
        seenLoaded: false,
      }),
    ).toEqual({ kind: 'let-go' });
    expect(unseenTicket('cell:8a4ba0a40d6ffff')).toEqual({ kind: 'let-go' });
  });

  it('takes the uuid out of a link pasted with punctuation or spaces after it', () => {
    expect(
      [`${UUID}。`, `${UUID}.`, `${UUID}）`, `${UUID}， `, `${UUID} `].map(
        unseenTicket,
      ),
    ).toEqual(Array(5).fill({ kind: 'replace', uuid: UUID }));
  });

  it('writes an upper-case uuid in lower case, as the ticket comes back, so the two meet', () => {
    expect(
      [UUID.toUpperCase(), `${UUID.toUpperCase()}。`].map(unseenTicket),
    ).toEqual(Array(2).fill({ kind: 'replace', uuid: UUID }));
  });

  it('says a link cut short names no ticket, without asking the backend', () => {
    expect(
      ['d0000000-0000-40', 'd0000000-0000-40。'].map(unseenTicket),
    ).toEqual([
      {
        kind: 'gone',
        ticket: {
          id: 'd0000000-0000-40',
          detailType: 'gone-ticket',
          availability: 'not_found',
        },
      },
      {
        kind: 'gone',
        ticket: {
          id: 'd0000000-0000-40。',
          detailType: 'gone-ticket',
          availability: 'not_found',
        },
      },
    ]);
  });
});
