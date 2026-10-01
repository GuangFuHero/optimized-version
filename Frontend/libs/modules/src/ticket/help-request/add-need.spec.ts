import { describe, expect, it } from 'vitest';

import { canAddNeed, toCreateTicketTaskInput } from './add-need';
import { emptyNeed } from './help-request-form';

describe('canAddNeed', () => {
  const requester = { ticketCreatedBy: 'user-1', viewerId: 'user-1' };

  it('lets the requester add to their request while it is open', () => {
    expect(canAddNeed({ ...requester, ticketStatus: 'pending' })).toBe(true);
    expect(canAddNeed({ ...requester, ticketStatus: 'in_progress' })).toBe(
      true,
    );
  });

  it('lets them add to a completed one too, which then opens again (Q20, as revised)', () => {
    expect(canAddNeed({ ...requester, ticketStatus: 'completed' })).toBe(true);
  });

  it('takes nothing more on a request cancelled for good', () => {
    expect(canAddNeed({ ...requester, ticketStatus: 'cancelled' })).toBe(false);
  });

  it('offers nothing to anyone else, guests included (revised Q14, Q21)', () => {
    expect(
      canAddNeed({
        ticketCreatedBy: 'user-1',
        viewerId: 'user-2',
        ticketStatus: 'pending',
      }),
    ).toBe(false);
    expect(
      canAddNeed({
        ticketCreatedBy: 'user-1',
        viewerId: null,
        ticketStatus: 'pending',
      }),
    ).toBe(false);
  });
});

describe('toCreateTicketTaskInput', () => {
  it('has nothing to send until a kind is chosen', () => {
    expect(toCreateTicketTaskInput('ticket-1', emptyNeed())).toBeNull();
  });

  it('adds the need to the ticket as the drawer would have filed it', () => {
    expect(
      toCreateTicketTaskInput('ticket-1', {
        need: 'supplies',
        name: ' 晚餐便當 ',
        quantity: '3',
      }),
    ).toEqual({
      ticketUuid: 'ticket-1',
      taskType: 'supply',
      taskName: '晚餐便當',
      quantity: 3,
    });
  });

  it('names it by its choice and leaves the quantity unknown when left blank', () => {
    expect(
      toCreateTicketTaskInput('ticket-1', {
        need: 'repair',
        name: '',
        quantity: '',
      }),
    ).toEqual({
      ticketUuid: 'ticket-1',
      taskType: 'hr',
      taskName: '修繕',
      quantity: null,
    });
  });
});
