'use client';

import { Box } from '@mui/material';
import { ZoomIn } from 'lucide-react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

/**
 * Said over the map while the cells' counts cannot be read, in the backend's words — as when
 * zoomed so far out that counting runs past its time limit. The cells already drawn stay, so the
 * map does not read as having no requests. It takes no taps: the map under it stays usable.
 */
export function MapCellsNotice({ message }: { message: string }) {
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
      {message}
    </Box>
  );
}
