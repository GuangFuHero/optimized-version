'use client';

import { useId } from 'react';

import { Box } from '@mui/material';
import { usePathname } from 'next/navigation';

import { resolveSidebarContent } from './defaults';
import { SidebarPanel } from './parts';

interface SidebarProps {
  open?: boolean;
  width?: number | string;
  collapsedWidth?: number | string;
  minHeight?: number | string;
  showCloseButton?: boolean;
  onClose?: () => void;
  onSignOut?: () => void;
}

const sidebarDefaults = {
  width: 320,
  minHeight: 820,
  collapsedWidth: 48,
  open: true,
  showCloseButton: false,
} as const;

export function Sidebar({
  open = sidebarDefaults.open,
  width = sidebarDefaults.width,
  collapsedWidth = sidebarDefaults.collapsedWidth,
  minHeight = sidebarDefaults.minHeight,
  showCloseButton = sidebarDefaults.showCloseButton,
  onClose,
  onSignOut,
}: SidebarProps) {
  const panelId = useId();
  const pathname = usePathname();
  const resolvedContent = resolveSidebarContent(pathname, onSignOut);
  const rootWidth = open ? width : collapsedWidth;

  return (
    <Box
      sx={{
        position: 'relative',
        width: rootWidth,
        minWidth: rootWidth,
        maxWidth: rootWidth,
        minHeight,
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      <SidebarPanel
        content={resolvedContent}
        open={open}
        width={width}
        collapsedWidth={collapsedWidth}
        minHeight={minHeight}
        panelId={panelId}
        showCloseButton={showCloseButton}
        onClose={onClose}
      />
    </Box>
  );
}
