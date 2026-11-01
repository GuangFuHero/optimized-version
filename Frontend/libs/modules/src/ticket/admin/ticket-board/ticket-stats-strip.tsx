'use client';

import { Box } from '@mui/material';
import { Users } from 'lucide-react';

import { StatTiles, StatTilesRetry } from '../../../admin/shared/stat-tiles';
import { ticketStatTiles, type TicketStats } from './model/ticket-stats';
import type { TicketStatus } from './model/ticket-row';

interface TicketStatsStripProps {
  /** Null while loading or after a failure: the row waits for the counts. */
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
  const tiles = ticketStatTiles(stats);
  if (!failed && !tiles) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {failed ? <StatTilesRetry retrying={retrying} onRetry={onRetry} /> : null}
      {tiles ? (
        <StatTiles
          items={tiles.items}
          value={status}
          onChange={onStatusChange}
          extras={[
            {
              label: '志工缺口',
              icon: <Users size={15} />,
              tone: 'warning',
              count: tiles.gap,
              title: '還沒結束的單裡，有寫數量的需求還差幾人',
            },
          ]}
        />
      ) : null}
    </Box>
  );
}
