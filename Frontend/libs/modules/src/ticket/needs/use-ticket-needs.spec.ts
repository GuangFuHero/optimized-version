import { describe, expect, it } from 'vitest';

import { readReloadedTicket } from './use-ticket-needs';

const need = {
  uuid: 'need-1',
  taskName: '清淤',
  taskType: 'hr',
  quantity: 5,
  status: 'pending',
  assignedCount: 1,
  myAssignment: null,
};

/** `GetTicket` as urql hands it over. The fragments' masking is only in the types. */
function answered(ticket: Record<string, unknown> | null) {
  return { data: { ticket } as never };
}

describe('readReloadedTicket', () => {
  it('reads a ticket that is still there: its needs and its status', () => {
    expect(
      readReloadedTicket(answered({ status: 'in_progress', tasks: [need] })),
    ).toEqual({
      kind: 'found',
      ticket: { needs: [need], ticketStatus: 'in_progress' },
    });
  });

  it('knows a ticket the server answered for with nothing — deleted, by its requester or another tab', () => {
    expect(readReloadedTicket(answered(null))).toEqual({ kind: 'gone' });
  });

  it('never takes a request that failed for a ticket that is gone', () => {
    expect(
      readReloadedTicket({
        error: { networkError: new TypeError('Failed to fetch') },
      }),
    ).toEqual({ kind: 'unanswered' });
  });

  it('does not trust a null ticket that came with an error', () => {
    expect(
      readReloadedTicket({
        ...answered(null),
        error: { graphQLErrors: [{ message: 'Unexpected error.' }] },
      }),
    ).toEqual({ kind: 'unanswered' });
  });

  it('reads no answer at all as no answer', () => {
    expect(readReloadedTicket({})).toEqual({ kind: 'unanswered' });
  });
});
