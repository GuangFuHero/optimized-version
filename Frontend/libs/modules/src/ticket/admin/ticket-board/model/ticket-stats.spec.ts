import { describe, expect, it } from 'vitest';

import { toTicketStats } from './ticket-stats';

describe('toTicketStats', () => {
  it('keys the counts by ticket status and keeps the total and the gap', () => {
    expect(
      toTicketStats({
        __typename: 'TicketStatsType',
        total: 9,
        pending: 4,
        inProgress: 3,
        completed: 1,
        cancelled: 1,
        gapPeople: 5,
        gapNeeds: 2,
      }),
    ).toEqual({
      total: 9,
      byStatus: { pending: 4, in_progress: 3, completed: 1, cancelled: 1 },
      gapPeople: 5,
      gapNeeds: 2,
    });
  });
});
