'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';

import { useStationStatusCounts } from './hooks/use-station-status-counts';
import { OPERATIONAL_STATUS_OPTIONS, type OperationalStatus } from './model/status';

const { color, radius, typography } = designTokens;

interface StationStatsStripProps {
  activeStatus: OperationalStatus | null;
  onSelectStatus: (status: OperationalStatus | null) => void;
}

export function StationStatsStrip({
  activeStatus,
  onSelectStatus,
}: StationStatsStripProps) {
  const { counts, isError } = useStationStatusCounts();
  if (isError) return null;

  const total = counts
    ? Object.values(counts).reduce((sum, n) => sum + n, 0)
    : null;
  const cards = [
    { key: null, label: '全部', count: total },
    ...OPERATIONAL_STATUS_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      count: counts ? (counts[option.value] ?? 0) : null,
    })),
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`,
        gap: '12px',
      }}
    >
      {cards.map((card) => {
        const active = card.key === activeStatus;
        return (
          <ButtonBase
            key={card.label}
            onClick={() => onSelectStatus(card.key)}
            aria-pressed={active}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              p: '12px 16px',
              borderRadius: `${radius.md}px`,
              border: `1px solid ${active ? color.bg.primary.default : color.border.default}`,
              bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.default,
              textAlign: 'left',
            }}
          >
            <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted }}>
              {card.label}
            </Typography>
            <Typography sx={{ ...typography.heading[600], color: color.fg.neutral.default }}>
              {card.count ?? '—'}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
