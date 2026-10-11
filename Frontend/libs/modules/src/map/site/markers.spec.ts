import { describe, expect, it } from 'vitest';

import type { TicketNeed } from '../../ticket/needs/need-claim';
import { mapTicketToMarker, withTicketStatus } from './markers';

/** A ticket as `GetTickets` returns it. The fragment's masking is only in the types. */
function ticket(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'ticket-1',
    propertyName: null,
    geometry: { type: 'Point', coordinates: [121.43, 23.67] },
    locationCell: null,
    title: '光復路 28 號清淤',
    description: '需要清淤',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    status: 'pending',
    priority: 'high',
    taskType: 'hr',
    visibility: 'public',
    verificationStatus: null,
    reviewNote: null,
    createdBy: 'user-1',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as never;
}

function markerOf(overrides: Record<string, unknown> = {}) {
  const marker = mapTicketToMarker(ticket(overrides));

  if (!marker) {
    throw new Error('the fixture has a point, so it maps to a marker');
  }

  return marker;
}

describe('withTicketStatus', () => {
  it('shows a status read again just as mapping the ticket afresh would', () => {
    expect(
      withTicketStatus(markerOf({ status: 'pending' }), 'completed'),
    ).toEqual(markerOf({ status: 'completed' }));
  });

  it('turns the pin to in progress once someone is on the ticket', () => {
    expect(
      withTicketStatus(markerOf({ status: 'pending' }), 'in_progress'),
    ).toMatchObject({
      label: '處理中',
      variant: 'in-progress',
      ticketMeta: { status: 'in_progress', priority: 'high' },
    });
  });

  it('keeps the rest of the marker as it was, its needs included', () => {
    const needs: TicketNeed[] = [
      {
        uuid: 'need-1',
        taskName: '清淤',
        taskType: 'hr',
        quantity: 1,
        status: 'fulfilled',
        assignedCount: 1,
        myAssignment: null,
      },
    ];
    const marker = { ...markerOf(), needs };

    const updated = withTicketStatus(marker, 'completed');

    expect(updated.needs).toBe(needs);
    expect(updated.title).toBe(marker.title);
    expect(updated.position).toEqual(marker.position);
    expect(updated.ticketMeta?.createdBy).toBe('user-1');
  });
});
