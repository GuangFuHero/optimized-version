'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import { Badge, designTokens } from '@rescue-frontend/ui';
import { Clock } from 'lucide-react';

import { getFreshness } from './model/freshness';
import { getOperationalStatusMeta } from './model/status';

const { color, typography } = designTokens;

const absoluteTime = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatAbsoluteTime(value: string | null | undefined): string {
  if (!value) return '—';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '—' : absoluteTime.format(time);
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const meta = getOperationalStatusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** 最後更新: muted past 24 hours, an amber pill past 72. Staleness is never shown as danger. */
export function FreshnessCell({
  updatedAt,
  now,
}: {
  updatedAt: string | null | undefined;
  now: Date;
}) {
  const { level, relative } = getFreshness(updatedAt, now);
  const absolute = formatAbsoluteTime(updatedAt);

  if (level === 'expired') {
    return (
      <Tooltip title={`${absolute}｜超過 72 小時未異動，前往前請先確認`}>
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <Badge tone="warning" icon={<Clock size={12} />}>
            {relative}
          </Badge>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      title={level === 'stale' ? `${absolute}｜超過 24 小時未異動` : absolute}
    >
      <Typography
        component="span"
        sx={{
          ...typography.data[300],
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color:
            level === 'fresh' ? color.fg.neutral.subtle : color.fg.neutral.muted,
        }}
      >
        {level === 'stale' ? <Clock size={12} /> : null}
        {relative}
      </Typography>
    </Tooltip>
  );
}
