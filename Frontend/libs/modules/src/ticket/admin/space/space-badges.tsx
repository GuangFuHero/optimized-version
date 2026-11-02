'use client';

import { Box } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { Building2 } from 'lucide-react';

import { Muted } from '../../../admin/shared/muted';
import {
  FLOOR_STATE_LABEL,
  isSpaceLoad,
  SPACE_LOAD_LABEL,
  type FloorState,
  type SpaceStatus,
} from './space-analysis';

const { color, radius, typography } = designTokens;

/** The prototype's dot and text colours per state (`tk-space.jsx` `STATE`). */
const STATE_COLOR: Record<FloorState, { dot: string; fg: string }> = {
  need: { dot: color.fg.danger, fg: color.fg.danger },
  progress: { dot: color.fg.warning, fg: color.fg.warning },
  done: { dot: color.fg.success, fg: color.fg.success },
  empty: { dot: color.border.default, fg: color.fg.neutral.muted },
};

export function floorStateColor(state: FloorState): string {
  return STATE_COLOR[state].fg;
}

/**
 * A floor's or a space's state: a dot and its words (`tk-space.jsx` `StateBadge`). A space whose
 * tickets aren't in says so instead, quietly and with no dot, as it has no state yet.
 */
export function StateBadge({ state }: { state: SpaceStatus }) {
  if (isSpaceLoad(state)) {
    return <Muted cell>{SPACE_LOAD_LABEL[state]}</Muted>;
  }
  const { dot, fg } = STATE_COLOR[state];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
        ...typography.data[300],
        fontWeight: 600,
        color: fg,
      }}
    >
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: dot,
          flexShrink: 0,
        }}
      />
      {FLOOR_STATE_LABEL[state]}
    </Box>
  );
}

/**
 * A pill with a building in it: 「空間」 on a space's row and card (`SpaceTag`), or a ticket's
 * 「名稱 · 3F」 beside its title (`tk-table.jsx` `data-space-of`).
 */
export function SpacePill({
  children,
  title,
  bold = false,
}: {
  children: string;
  title?: string;
  bold?: boolean;
}) {
  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        height: 18,
        px: '7px',
        maxWidth: 180,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.sunken,
        ...typography.data[300],
        fontWeight: bold ? 700 : undefined,
        color: color.fg.neutral.subtle,
      }}
    >
      <Building2 size={bold ? 11 : 10} style={{ flexShrink: 0 }} />
      {children}
    </Box>
  );
}

/** 「空間」 above a space's name. */
export function SpaceTag() {
  return <SpacePill bold>空間</SpacePill>;
}
