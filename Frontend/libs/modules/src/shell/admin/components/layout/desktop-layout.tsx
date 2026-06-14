'use client';

import { useState, type ReactNode } from 'react';

import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { Sidebar } from '../sidebar';
import { TopNavBar } from '../top-navbar';
import { LAYOUT_DIMENSIONS } from './constants';

interface AdminDesktopLayoutProps {
  children: ReactNode;
  onSignOut?: () => void;
}

export function AdminDesktopLayout({
  children,
  onSignOut,
}: AdminDesktopLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const rescue = getRescueColorScheme(useTheme());
  const bodyMinHeight = `calc(100dvh - ${LAYOUT_DIMENSIONS.desktopTopNavBarHeight}px)`;
  const sidebarWidth = sidebarOpen
    ? LAYOUT_DIMENSIONS.expandedSidebarWidth
    : LAYOUT_DIMENSIONS.collapsedSidebarWidth;

  return (
    <Box
      sx={{
        display: 'grid',
        position: 'relative',
        isolation: 'isolate',
        gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`,
        gridTemplateRows: `${LAYOUT_DIMENSIONS.desktopTopNavBarHeight}px minmax(0, 1fr)`,
        minHeight: '100dvh',
        bgcolor: rescue.adminShell.topNavBar.frame,
        transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Box
        sx={{
          gridColumn: '1 / -1',
          gridRow: 1,
          minWidth: 0,
          position: 'relative',
          zIndex: 3,
        }}
      >
        <TopNavBar />
      </Box>

      <Box
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        onFocusCapture={() => setSidebarOpen(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;

          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(nextTarget)
          ) {
            return;
          }

          setSidebarOpen(false);
        }}
        sx={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <Sidebar
          open={sidebarOpen}
          width={LAYOUT_DIMENSIONS.expandedSidebarWidth}
          collapsedWidth={LAYOUT_DIMENSIONS.collapsedSidebarWidth}
          minHeight={bodyMinHeight}
          onSignOut={onSignOut}
        />
      </Box>

      <Box
        component="main"
        sx={{
          gridColumn: 2,
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          overflow: 'auto',
          zIndex: 0,
          bgcolor: '#444444',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
