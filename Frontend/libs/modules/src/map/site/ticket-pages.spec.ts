import { describe, expect, it } from 'vitest';

import { nextTicketPageSkip, ticketPageVariables } from './ticket-pages';

describe('ticketPageVariables', () => {
  it("asks for the list's needs-first order, with the filters and the page", () => {
    expect(
      ticketPageVariables({
        status: 'pending',
        q: '清淤',
        skip: 80,
        limit: 100,
      }),
    ).toEqual({
      bounds: undefined,
      status: 'pending',
      q: '清淤',
      skip: 80,
      limit: 100,
      order: 'NEEDS_FIRST',
    });
  });

  it('asks for it on the first page too, with no filter', () => {
    expect(ticketPageVariables({ skip: 0, limit: 100 }).order).toBe(
      'NEEDS_FIRST',
    );
  });
});

describe('nextTicketPageSkip', () => {
  it('fetches the ticket that slid up when a loaded one dropped to the end between two pages', () => {
    const before = Array.from({ length: 300 }, (_, index) => `t${index}`);
    const loaded = before.slice(0, 100);
    // t5's last place filled: it drops to the last tier, and every ticket after it moves up one.
    const after = [...before.filter((id) => id !== 't5'), 't5'];
    const skip = nextTicketPageSkip(loaded.length);

    expect(after.slice(skip, skip + 100)).toContain('t100');
  });

  it('starts at the top while fewer than a page are loaded', () => {
    expect(nextTicketPageSkip(0)).toBe(0);
    expect(nextTicketPageSkip(10)).toBe(0);
  });
});
