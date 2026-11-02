import type { AdminTicketStatsQuery } from '@rescue-frontend/data-access/admin';

import {
  STAT_TILE_ALL,
  type StatTileItem,
  type StatTileParts,
} from '../../../../admin/shared/model/stat-tiles';
import { TICKET_STATUS_OPTIONS } from '../../../status';
import type { TicketStatus } from './ticket-row';

export interface TicketStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  /** People still missing across the 人力 needs still recruiting on open tickets; other types add none. */
  gapPeople: number;
  /** Those needs still missing at least one person. */
  gapNeeds: number;
}

/** The backend's `ticketStats` (the whole board in the caller's scope), keyed the way the strip reads it. */
export function toTicketStats(
  stats: AdminTicketStatsQuery['ticketStats'],
): TicketStats {
  return {
    total: stats.total,
    byStatus: {
      pending: stats.pending,
      in_progress: stats.inProgress,
      completed: stats.completed,
      cancelled: stats.cancelled,
    },
    gapPeople: stats.gapPeople,
    gapNeeds: stats.gapNeeds,
  };
}

/**
 * The board's tiles (prototype tk-table.jsx): 全部 and each status still worked on, to filter by;
 * and 志工缺口, which only shows — no filter answers it (STAT-105). 已取消 has no tile, as a cancelled
 * ticket is no work to pick up; 全部 still counts it and says how many, so the tiles need not add up
 * to it unexplained, and the filter panel finds them (STAT-107). The row shows while the stats are
 * not in, every count reading — (STAT-108), and with no ticket, every count 0.
 */
export function ticketStatTiles(stats: TicketStats | null): {
  items: StatTileItem<TicketStatus>[];
  /** The people still short and the needs short of them; 0 with none short. */
  gap: StatTileParts | 0 | null;
} {
  const cancelled = stats?.byStatus.cancelled ?? 0;
  return {
    items: [
      stats && cancelled > 0
        ? {
            key: STAT_TILE_ALL,
            label: '全部',
            count: { main: String(stats.total), sub: `含已取消 ${cancelled}` },
            title: `全部 ${stats.total} 張，其中 ${cancelled} 張已取消（不另列一格）`,
          }
        : { key: STAT_TILE_ALL, label: '全部', count: stats?.total ?? null },
      ...TICKET_STATUS_OPTIONS.filter(
        (option) => option.value !== 'cancelled',
      ).map((option) => ({
        key: option.value,
        label: option.label,
        count: stats?.byStatus[option.value] ?? null,
      })),
    ],
    gap: !stats
      ? null
      : stats.gapPeople > 0
        ? { main: `缺 ${stats.gapPeople} 人`, sub: `${stats.gapNeeds} 項需求` }
        : 0,
  };
}
