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
  /** People still missing across open tickets. */
  gapPeople: number;
  /** Open needs still missing at least one person. */
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

/** The statuses with a tile: the design leaves 已取消 out. */
const TILE_STATUSES = TICKET_STATUS_OPTIONS.filter(
  (option) => option.value !== 'cancelled',
);

/**
 * The board's tiles (prototype tk-table.jsx): 全部, 待處理, 處理中 and 已完成, to filter by; and 志工缺口,
 * which only shows — no filter answers it (STAT-105). None while the stats are not in, or with no
 * ticket: the prototype draws the row only once there are tickets.
 */
export function ticketStatTiles(stats: TicketStats | null): {
  items: StatTileItem<TicketStatus>[];
  /** The people still short and the needs short of them; 0 with none short. */
  gap: StatTileParts | 0;
} | null {
  if (!stats || stats.total === 0) return null;
  return {
    items: [
      { key: STAT_TILE_ALL, label: '全部', count: stats.total },
      ...TILE_STATUSES.map((option) => ({
        key: option.value,
        label: option.label,
        count: stats.byStatus[option.value],
      })),
    ],
    gap:
      stats.gapPeople > 0
        ? { main: `缺 ${stats.gapPeople} 人`, sub: `${stats.gapNeeds} 項需求` }
        : 0,
  };
}
