'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import { Badge, designTokens } from '@rescue-frontend/ui';
import { Clock } from 'lucide-react';

import { getFreshness } from './model/freshness';
import { getOperationalStatusMeta } from '../../operational-status';
import { formatTaiwanDateTime } from '../../../time';

const { color, radius, typography } = designTokens;

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const meta = getOperationalStatusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** 最後更新: muted past 24 hours, an orange outlined pill past 72. Staleness is never shown as danger. */
export function FreshnessCell({
  updatedAt,
  now,
}: {
  updatedAt: string | null | undefined;
  now: Date;
}) {
  const { level, relative } = getFreshness(updatedAt, now);
  const absolute = formatTaiwanDateTime(updatedAt) ?? '—';

  if (level === 'expired') {
    return (
      <Tooltip title={`${absolute}｜超過 72 小時未異動，前往前請先確認`}>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            height: 24,
            px: '9px',
            boxSizing: 'border-box',
            borderRadius: `${radius.full}px`,
            whiteSpace: 'nowrap',
            bgcolor: color.bg.primary.subtle,
            border: `1px solid ${color.brand.primary.default}`,
            color: color.brand.primary.subtle,
            ...typography.data[300],
            fontWeight: 700,
          }}
        >
          <Clock size={12} />
          {relative}
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
          gap: '5px',
          whiteSpace: 'nowrap',
          color:
            level === 'fresh'
              ? color.fg.neutral.subtle
              : color.fg.neutral.muted,
        }}
      >
        {level === 'stale' ? <Clock size={12} /> : null}
        {relative}
      </Typography>
    </Tooltip>
  );
}
