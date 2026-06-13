'use client';

import type { ReactNode } from 'react';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

interface AdminDetailModalFrameProps {
  containerSx?: SxProps<Theme>;
  header: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

function mergeSx(base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> {
  if (!sx) {
    return base;
  }

  return (Array.isArray(sx) ? [base, ...sx] : [base, sx]) as SxProps<Theme>;
}

export function AdminDetailModalFrame({
  containerSx,
  header,
  tabs,
  children,
  footer,
}: AdminDetailModalFrameProps) {
  return (
    <Box
      component="aside"
      sx={mergeSx(
        {
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        containerSx,
      )}
    >
      {header}
      {tabs}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: 2.5,
          py: 2.25,
        }}
      >
        {children}
      </Box>
      {footer}
    </Box>
  );
}
