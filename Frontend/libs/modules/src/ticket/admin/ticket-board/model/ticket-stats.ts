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

/**
 * The board's tiles (prototype tk-table.jsx): 全部 and each status, to filter by; and 志工缺口, which
 * only shows — no filter answers it (STAT-105). Null while the stats are not in: every count reads —.
 */
export function ticketStatTiles(stats: TicketStats | null): {
  items: StatTileItem[];
  /** The people still short and the needs short of them; 0 with none short. */
  gap: StatTileParts | 0 | null;
} {
  return {
    items: [
      { key: STAT_TILE_ALL, label: '全部', count: stats?.total ?? null },
      ...TICKET_STATUS_OPTIONS.map((option) => ({
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
