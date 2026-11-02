import { describe, expect, it } from 'vitest';

import { ticketStatTiles, toTicketStats } from './ticket-stats';

describe('ticketStatTiles', () => {
  const stats = {
    total: 9,
    byStatus: { pending: 4, in_progress: 3, completed: 1, cancelled: 1 },
    gapPeople: 637,
    gapNeeds: 14,
  };

  it('gives 全部 and the statuses still worked on a tile to filter by, 已取消 none', () => {
    expect(ticketStatTiles(stats).items).toEqual([
      {
        key: 'all',
        label: '全部',
        count: { main: '9', sub: '含已取消 1' },
        title: '全部 9 張，其中 1 張已取消（不另列一格）',
      },
      { key: 'pending', label: '待處理', count: 4 },
      { key: 'in_progress', label: '處理中', count: 3 },
      { key: 'completed', label: '已完成', count: 1 },
    ]);
  });

  it('writes no 含已取消 under 全部 when none is cancelled', () => {
    const [all] = ticketStatTiles({
      ...stats,
      total: 8,
      byStatus: { ...stats.byStatus, cancelled: 0 },
    }).items;
    expect(all).toEqual({ key: 'all', label: '全部', count: 8 });
    expect(all).not.toHaveProperty('title');
  });

  it('splits the volunteer gap into the people short and the needs short of them', () => {
    expect(ticketStatTiles(stats).gap).toEqual({
      main: '缺 637 人',
      sub: '14 項需求',
    });
    expect(ticketStatTiles({ ...stats, gapPeople: 0, gapNeeds: 0 }).gap).toBe(
      0,
    );
  });

  it('keeps the row while the stats are not in: every count reads —, never 0', () => {
    const tiles = ticketStatTiles(null);
    expect(tiles.items.map((item) => item.count)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(tiles.gap).toBeNull();
  });

  it('keeps the row with no ticket, every count 0', () => {
    const tiles = ticketStatTiles({
      total: 0,
      byStatus: { pending: 0, in_progress: 0, completed: 0, cancelled: 0 },
      gapPeople: 0,
      gapNeeds: 0,
    });
    expect(tiles.items.map((item) => item.count)).toEqual([0, 0, 0, 0]);
    expect(tiles.gap).toBe(0);
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
