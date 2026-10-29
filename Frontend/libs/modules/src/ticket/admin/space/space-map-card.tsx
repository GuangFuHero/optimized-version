'use client';

import { Box, IconButton, Typography } from '@mui/material';
import { Badge, Button, designTokens } from '@rescue-frontend/ui';
import { Layers, X } from 'lucide-react';

import { FLOOR_STATE_LABEL, type SpaceListRow } from './space-analysis';
import { FLOOR_STATE_TONE } from './space-map';

const { color, radius, shadow, typography } = designTokens;

const INSET = 12;

/**
 * The card a space's map pin opens (designer §開啟空間 3): name, address, state and summary, and
 * 「看各樓層」 to open its floors.
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
        width: 276,
        maxWidth: `calc(100% - ${INSET * 2}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        p: '12px 14px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        boxShadow: shadow.lg,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <Typography sx={{ ...typography.label[500], flex: 1, minWidth: 0 }}>
          {`🏢 ${row.name}`}
        </Typography>
        <IconButton
          aria-label="關閉"
          onClick={onClose}
          size="small"
          sx={{ width: 24, height: 24, p: 0, color: color.fg.neutral.muted }}
        >
          <X size={14} />
        </IconButton>
      </Box>
      {row.address ? (
        <Typography
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          {row.address}
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge tone={FLOOR_STATE_TONE[row.status]}>
          {FLOOR_STATE_LABEL[row.status]}
        </Badge>
        <Typography
          sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
        >
          {row.summary}
        </Typography>
      </Box>
      <Button
        variant="outline"
        size="sm"
        startIcon={<Layers size={15} />}
        onClick={() => onOpenFloors(row.id)}
      >
        看各樓層
      </Button>
    </Box>
  );
}
