import { describe, expect, it } from 'vitest';

import { canStopRecruiting, isTicketRequester } from './need-actions';
import type { TicketNeed } from './need-claim';

function need(overrides: Partial<TicketNeed> = {}): TicketNeed {
  return {
    uuid: 'need-1',
    taskName: '清淤',
    taskType: 'hr',
    quantity: 5,
    status: 'pending',
    assignedCount: 2,
    myAssignment: null,
    ...overrides,
  };
}

describe('isTicketRequester', () => {
  it('knows the viewer who filed the ticket', () => {
    expect(isTicketRequester('user-1', 'user-1')).toBe(true);
  });

  it('takes nobody else for them', () => {
    expect(isTicketRequester('user-1', 'user-2')).toBe(false);
  });

  it('takes no guest for them', () => {
    expect(isTicketRequester('user-1', null)).toBe(false);
  });

  it('never matches two missing ids: a guest on a ticket with no requester on record', () => {
    expect(isTicketRequester(null, null)).toBe(false);
    expect(isTicketRequester(undefined, undefined)).toBe(false);
    expect(isTicketRequester('', '')).toBe(false);
  });
});

describe('canStopRecruiting', () => {
  it('offers an open need with people on it', () => {
    expect(canStopRecruiting(need(), 'in_progress')).toBe(true);
  });

  it('does not offer a need nobody claimed: there is no one to keep, so it can only be deleted', () => {
    expect(canStopRecruiting(need({ assignedCount: 0 }), 'pending')).toBe(
      false,
    );
  });

  it('does not offer a need that has its people, or was stopped already', () => {
    expect(
      canStopRecruiting(
        need({ status: 'fulfilled', assignedCount: 5 }),
        'in_progress',
      ),
    ).toBe(false);
  });

  it('does not offer a need called off', () => {
    expect(canStopRecruiting(need({ status: 'canceled' }), 'in_progress')).toBe(
      false,
    );
  });

  it('does not offer a need on a closed ticket, which the backend refuses too', () => {
    expect(canStopRecruiting(need(), 'completed')).toBe(false);
    expect(canStopRecruiting(need(), 'cancelled')).toBe(false);
  });

  it('offers a need without a quantity, and one over-sent before coordinators were capped', () => {
    expect(
      canStopRecruiting(
        need({ quantity: null, assignedCount: 3 }),
        'in_progress',
      ),
    ).toBe(true);
    // Still pending at 3/1: stopping it sets its quantity to the 3 on it.
    expect(
      canStopRecruiting(need({ quantity: 1, assignedCount: 3 }), 'in_progress'),
    ).toBe(true);
  });
});
