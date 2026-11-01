'use client';

import { Box } from '@mui/material';
import { Button, Callout } from '@rescue-frontend/ui';
import { Users } from 'lucide-react';

import { STAT_TILE_ALL } from '../../../admin/shared/model/stat-tiles';
import { StatTiles } from '../../../admin/shared/stat-tiles';
import { ticketStatTiles, type TicketStats } from './model/ticket-stats';
import type { TicketStatus } from './model/ticket-row';

interface TicketStatsStripProps {
  /** Null while loading or after a failure: an unknown count shows as —, never as 0. */
  stats: TicketStats | null;
  /** The counts did not load: its own 重試, as the list may have loaded fine. */
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  /** The board's status filter, the same one the filter panel's chips set (STAT-103). */
  status: TicketStatus | null;
  onStatusChange: (status: TicketStatus | null) => void;
}

/**
 * The board's counts, each a filter on its status; 志工缺口 only shows (prototype tk-table.jsx).
 */
export function TicketStatsStrip({
  stats,
  failed,
  retrying,
  onRetry,
  status,
  onStatusChange,
}: TicketStatsStripProps) {
  const { items, gap } = ticketStatTiles(stats);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {failed ? (
        <Callout tone="danger">
          無法載入統計，請稍後再試
          <Button
            variant="ghost"
            size="sm"
            disabled={retrying}
            onClick={onRetry}
          >
            重試
          </Button>
        </Callout>
      ) : null}
      <StatTiles
        items={items}
        value={status ?? STAT_TILE_ALL}
        onChange={(next) =>
          onStatusChange(next === STAT_TILE_ALL ? null : (next as TicketStatus))
        }
        extras={[
          {
            label: '志工缺口',
            icon: <Users size={15} />,
            tone: 'warning',
            count: gap,
            title: '還沒結束的單裡，有寫數量的需求還差幾人',
          },
        ]}
      />
    </Box>
  );
}
