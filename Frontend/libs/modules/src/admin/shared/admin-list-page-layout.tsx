'use client';

import type { ReactNode } from 'react';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export interface AdminListPageLayoutProps {
  header: ReactNode;
  filterPanel?: ReactNode;
  list: ReactNode;
  footer?: ReactNode;
  minHeight?: number | string;
  height?: number | string;
  canvasColor?: string;
  filterPanelSx?: SxProps<Theme>;
  listContainerSx?: SxProps<Theme>;
}

function toCssSize(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value;
}

function mergeSx(base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> {
  if (!sx) {
    return base;
  }

  return (Array.isArray(sx) ? [base, ...sx] : [base, sx]) as SxProps<Theme>;
}

export function AdminListPageLayout({
  header,
  filterPanel,
  list,
  footer,
  minHeight = '100%',
  height = minHeight,
  canvasColor = '#FFFFFF',
  filterPanelSx,
  listContainerSx,
}: AdminListPageLayoutProps) {
  return (
    <Box
      component="section"
      sx={{
        width: '100%',
        minHeight: toCssSize(minHeight),
        height: toCssSize(height),
        bgcolor: canvasColor,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {header}
      {filterPanel ? <Box sx={filterPanelSx}>{filterPanel}</Box> : null}
      <Box
        sx={mergeSx(
          {
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            bgcolor: canvasColor,
          },
          listContainerSx,
        )}
      >
        {list}
      </Box>
      {footer}
    </Box>
  );
}
