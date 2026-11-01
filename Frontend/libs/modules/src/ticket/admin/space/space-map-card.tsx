'use client';

import { Box, IconButton, Typography } from '@mui/material';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Layers, X } from 'lucide-react';

import type { SpaceListRow } from './space-analysis';
import { SpaceTag, StateBadge } from './space-badges';

const { color, radius, shadow, typography } = designTokens;

const INSET = 12;

/**
 * The card a space's map pin opens (`tk-space.jsx` `SpaceMapCard`): name, address, state and
 * summary, and 「看各樓層」 to open its floors.
 */
export function SpaceMapCard({
  row,
  onOpenFloors,
  onClose,
}: {
  row: SpaceListRow;
  onOpenFloors: (spaceId: string) => void;
  onClose: () => void;
}) {
  return (
    <Box
      role="region"
      aria-label={`空間：${row.name}`}
      sx={{
        position: 'absolute',
        zIndex: 600,
        top: INSET,
        right: INSET,
        width: 268,
        maxWidth: `calc(100% - ${INSET * 2}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '14px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        boxShadow: shadow.lg,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SpaceTag />
          <Typography
            sx={{
              ...typography.label[500],
              fontSize: 15,
              color: color.fg.neutral.default,
              mt: '3px',
            }}
          >
            {row.name}
          </Typography>
          {row.address ? (
            <Typography
              sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
            >
              {row.address}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          aria-label="關閉"
          onClick={onClose}
          size="small"
          sx={{
            width: 24,
            height: 24,
            p: 0,
            flexShrink: 0,
            color: color.fg.neutral.muted,
          }}
        >
          <X size={14} />
        </IconButton>
      </Box>
      <StateBadge state={row.status} />
      <Typography
        sx={{ ...typography.data[300], color: color.fg.neutral.subtle }}
      >
        {row.summary}
      </Typography>
      <Button
        size="sm"
        startIcon={<Layers size={15} />}
        onClick={() => onOpenFloors(row.id)}
      >
        看各樓層
      </Button>
    </Box>
  );
}
