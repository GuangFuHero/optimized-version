'use client';

import { Box } from '@mui/material';
import { ZoomIn } from 'lucide-react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { TicketCellsNotice } from './ticket-cells';

const { color, radius, shadow } = designTokens;

/**
 * Said over the map while the cells' counts cannot be read: past the backend's time limit, zoomed
 * far out, in its words and with a zoom-in icon; otherwise a fixed line without one. It takes no
 * taps: the map under it stays usable.
 */
export function MapCellsNotice({ notice }: { notice: TicketCellsNotice }) {
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 1200,
        maxWidth: 'calc(100% - 32px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 1.75,
        py: 1,
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.default,
        boxShadow: shadow.md,
        color: color.fg.neutral.default,
        fontSize: displayTextSize[13],
        lineHeight: 1.5,
        pointerEvents: 'none',
      }}
    >
      {notice.zoomIn ? (
        <Box
          component={ZoomIn}
          aria-hidden
          sx={{
            width: 16,
            height: 16,
            flexShrink: 0,
            color: color.fg.neutral.muted,
          }}
        />
      ) : null}
      {notice.text}
    </Box>
  );
}
