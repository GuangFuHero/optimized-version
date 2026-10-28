import { describe, expect, it } from 'vitest';

import type { TicketRow, TicketStatus } from './ticket-row';
import { ticketStats } from './ticket-stats';

const row = (status: TicketStatus, gaps: number[] = []) =>
  ({
    status,
    tasks: gaps.map((gap) => ({ gap })),
    volunteerGap: gaps.reduce((a, b) => a + b, 0),
  }) as unknown as TicketRow;

describe('ticketStats', () => {
  it('counts by status and totals', () => {
    const stats = ticketStats([
      row('pending'),
      row('pending'),
      row('in_progress'),
      row('cancelled'),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.byStatus).toEqual({
      pending: 2,
      in_progress: 1,
      completed: 0,
      cancelled: 1,
    });
  });

  it('reports the volunteer gap in people and in needs', () => {
    const stats = ticketStats([
      row('pending', [3, 0]),
      row('in_progress', [1]),
    ]);
    expect(stats.gapPeople).toBe(4);
    expect(stats.gapNeeds).toBe(2);
  });

  it('leaves cancelled and completed tickets out of the gap', () => {
    const stats = ticketStats([row('cancelled', [2]), row('completed', [5])]);
    expect(stats.gapPeople).toBe(0);
    expect(stats.gapNeeds).toBe(0);
  });
});
