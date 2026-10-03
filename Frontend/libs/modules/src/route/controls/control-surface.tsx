'use client';

import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

interface SiteControlSurfaceProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * 前台地圖控制項共用底層（膠囊）。
 *
 * Mirrors `surfaceBase` in `Design/前台/js/site/site-controls.jsx`. The border is the warm
 * `border.accent`, not a neutral grey — these pills float over map tiles, and the warm edge is what
 * separates them from the terrain underneath.
 */
export function SiteControlSurface({ children, sx }: SiteControlSurfaceProps) {
  return (
    <Box
      sx={[
        {
          bgcolor: color.bg.neutral.default,
          border: `1px solid ${color.border.accent}`,
          borderRadius: `${radius.full}px`,
          boxShadow: shadow.sm,
          color: color.fg.neutral.default,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
