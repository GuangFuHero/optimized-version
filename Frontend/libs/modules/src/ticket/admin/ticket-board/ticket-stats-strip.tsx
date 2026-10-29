'use client';

import { Box, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';

import type { TicketStats } from './model/ticket-stats';
import { TICKET_STATUS_OPTIONS } from '../../status';

const { color, radius, typography } = designTokens;

interface TicketStatsStripProps {
  /** Null while loading or after a failure: an unknown count shows as —, never as 0. */
  stats: TicketStats | null;
}

export function TicketStatsStrip({ stats }: TicketStatsStripProps) {
  const cards = [
    { key: 'all', label: '全部', count: stats?.total },
    ...TICKET_STATUS_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      count: stats?.byStatus[option.value],
    })),
  ];
  const warn = (stats?.gapPeople ?? 0) > 0;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cards.length + 1}, minmax(0, 1fr))`,
        gap: '12px',
      }}
    >
      {cards.map((card) => (
        <Tile key={card.key} label={card.label}>
          {card.count ?? '—'}
        </Tile>
      ))}
      <Tile label="志工缺口" warn={warn}>
        {stats ? `缺 ${stats.gapPeople} 人 · ${stats.gapNeeds} 項需求` : '—'}
      </Tile>
    </Box>
  );
}

function Tile({
  label,
  warn = false,
  children,
}: {
  label: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4px',
        p: '12px 16px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${warn ? color.bg.warning.hover : color.border.default}`,
        bgcolor: warn ? color.bg.warning.subtle : color.bg.neutral.default,
      }}
    >
      <Typography
        sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          ...typography.heading[600],
          color: warn ? color.fg.warning : color.fg.neutral.default,
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}
