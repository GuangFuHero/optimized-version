import { describe, expect, it } from 'vitest';

import { ticketStatTiles, toTicketStats } from './ticket-stats';

describe('ticketStatTiles', () => {
  const stats = {
    total: 9,
    byStatus: { pending: 4, in_progress: 3, completed: 1, cancelled: 1 },
    gapPeople: 637,
    gapNeeds: 14,
  };

  it('gives 全部 and each status but 已取消 a tile to filter by', () => {
    expect(ticketStatTiles(stats)?.items).toEqual([
      { key: 'all', label: '全部', count: 9 },
      { key: 'pending', label: '待處理', count: 4 },
      { key: 'in_progress', label: '處理中', count: 3 },
      { key: 'completed', label: '已完成', count: 1 },
    ]);
  });

  it('splits the volunteer gap into the people short and the needs short of them', () => {
    expect(ticketStatTiles(stats)?.gap).toEqual({
      main: '缺 637 人',
      sub: '14 項需求',
    });
    expect(ticketStatTiles({ ...stats, gapPeople: 0, gapNeeds: 0 })?.gap).toBe(
      0,
    );
  });

  it('draws no row while the stats are not in, or with no ticket', () => {
    expect(ticketStatTiles(null)).toBeNull();
    expect(
      ticketStatTiles({
        total: 0,
        byStatus: { pending: 0, in_progress: 0, completed: 0, cancelled: 0 },
        gapPeople: 0,
        gapNeeds: 0,
      }),
    ).toBeNull();
  });
});

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
