import { describe, expect, it } from 'vitest';

import { resolveLinkedTicket, shouldLookUpLinkedTicket } from './linked-ticket';

const UUID = 'd0000000-0000-4000-8000-000000000051';

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
    tasks: [],
    ...overrides,
  } as never;
}

describe('resolveLinkedTicket', () => {
  it('opens a ticket the backend gives, whatever the availability beside it', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: ticket(), ticketAvailability: 'available' },
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

  it('says deleted only when the backend does, carrying the link and nothing of the ticket', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: null, ticketAvailability: 'deleted' },
      }),
    ).toEqual({
      kind: 'gone',
      ticket: { id: UUID, detailType: 'gone-ticket', availability: 'deleted' },
    });
  });

  it('says not found for a uuid that never was, or one the caller cannot see', () => {
    expect(
      resolveLinkedTicket(UUID, {
        data: { ticket: null, ticketAvailability: 'not_found' },
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
        data: { ticket: null, ticketAvailability: 'available' },
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
          ticketAvailability: 'available',
        },
      }),
    ).toEqual({ kind: 'unknown' });
  });
});

describe('shouldLookUpLinkedTicket', () => {
  it('looks up a ticket uuid the loaded pages never held', () => {
    expect(
      shouldLookUpLinkedTicket({
        selectedId: UUID,
        dataType: 'ticket',
        seenLoaded: false,
      }),
    ).toBe(true);
  });

  it('lets go of one seen loaded and gone since: a filter or a pan left it out', () => {
    expect(
      shouldLookUpLinkedTicket({
        selectedId: UUID,
        dataType: 'ticket',
        seenLoaded: true,
      }),
    ).toBe(false);
  });

  it("never looks up a station, nor a guest's location cell", () => {
    expect(
      shouldLookUpLinkedTicket({
        selectedId: UUID,
        dataType: 'station',
        seenLoaded: false,
      }),
    ).toBe(false);
    expect(
      shouldLookUpLinkedTicket({
        selectedId: 'cell:8a4ba0a40d6ffff',
        dataType: 'ticket',
        seenLoaded: false,
      }),
    ).toBe(false);
  });
});
