'use client';

import { Box, Typography } from '@mui/material';
import { designTokens, Tag } from '@rescue-frontend/ui';

import { tagToneOf } from '../../../admin/shared/tag-tone';
import { getOperationalStatusMeta } from '../../operational-status';
import { getStationTypeIcon, getStationTypeLabel } from '../../type-options';

const { color, typography } = designTokens;

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const meta = getOperationalStatusMeta(status);
  return <Tag tone={tagToneOf(meta.tone)}>{meta.label}</Tag>;
}

/** The prototype's `TypeChip` (station-shared.jsx): a muted icon before the type in subtle grey. */
export function TypeChip({ type }: { type: string | null | undefined }) {
  const TypeIcon = getStationTypeIcon(type);
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: 0,
      }}
    >
      <TypeIcon sx={{ fontSize: 16, color: color.fg.neutral.muted }} />
      <Typography
        noWrap
        sx={{ ...typography.label[400], color: color.fg.neutral.subtle }}
      >
        {getStationTypeLabel(type)}
      </Typography>
    </Box>
  );
}
