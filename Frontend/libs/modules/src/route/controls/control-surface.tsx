'use client';

import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

interface SiteControlSurfaceProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * 前台地圖控制項共用底層樣式（毛玻璃膠囊），與後台地圖工具列維持一致視覺語言。
 */
export function SiteControlSurface({ children, sx }: SiteControlSurfaceProps) {
  return (
    <Box
      sx={[
        {
          bgcolor: '#FFFFFF',
          border: '1px solid #dcc1b1',
          borderRadius: 999,
          boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
          color: '#151c22',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
