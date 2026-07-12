'use client';

import type { ReactNode } from 'react';

import { Box, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { SidebarCloseButton } from '../sidebar-close-button';
import { SidebarMenuItem } from '../sidebar-menu-item';
import type { SidebarResolvedContent } from '../../../sidebar';

const sidebarTransition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

interface SidebarPanelProps {
  content: SidebarResolvedContent;
  open: boolean;
  width?: number | string;
  collapsedWidth?: number | string;
  minHeight?: number | string;
  panelId?: string;
  headerContent?: ReactNode;
  showCloseButton?: boolean;
  onClose?: () => void;
}

function useSidebarPalette() {
  return getRescueColorScheme(useTheme()).adminShell.sidebar;
}

export function SidebarPanel({
  content,
  open,
  width = 320,
  collapsedWidth = 56,
  minHeight = 820,
  panelId,
  headerContent,
  showCloseButton = false,
  onClose,
}: SidebarPanelProps) {
  const sidebarPalette = useSidebarPalette();
  const resolvedWidth = open ? width : collapsedWidth;

  return (
    <Box
      component="aside"
      id={panelId}
      data-open={open ? 'true' : 'false'}
      sx={{
        width: resolvedWidth,
        minWidth: resolvedWidth,
        maxWidth: resolvedWidth,
        minHeight,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pl: 1,
        pr: open ? '17px' : '7px',
        py: 2,
        overflow: 'hidden',
        bgcolor: sidebarPalette.frame,
        borderRight: `1px solid ${sidebarPalette.border}`,
        transition: sidebarTransition,
        boxShadow: open ? '0 24px 48px rgba(21, 28, 34, 0.16)' : 'none',
      }}
    >
      {showCloseButton && headerContent ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            pb: 2,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>{headerContent}</Box>
          <Box sx={{ display: 'inline-flex', flexShrink: 0 }}>
            <SidebarCloseButton onClick={onClose} ariaControls={panelId} />
          </Box>
        </Box>
      ) : showCloseButton ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            pb: 2,
          }}
        >
          <SidebarCloseButton onClick={onClose} ariaControls={panelId} />
        </Box>
      ) : headerContent ? (
        <Box sx={{ pb: 2 }}>{headerContent}</Box>
      ) : null}

      {/* <Box sx={{ pb: 3 }}>
        <SidebarPrimaryAction item={content.primaryAction} open={open} />
      </Box> */}

      <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
        {content.navigationItems.map((item) => (
          <SidebarMenuItem
            key={item.id}
            item={item}
            open={open}
            ariaPressed={item.selected ?? false}
            lineHeight="16px"
            letterSpacing="0.35px"
          />
        ))}
      </Stack>

      <Stack
        spacing={0.5}
        sx={{
          mt: 2,
          pt: 2,
          borderTop: `1px solid ${sidebarPalette.border}`,
        }}
      >
        {content.footerActions.map((item) => (
          <SidebarMenuItem
            key={item.id}
            item={item}
            open={open}
            iconSize={17}
          />
        ))}
      </Stack>
    </Box>
  );
}
