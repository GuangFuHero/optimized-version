'use client';

import { useState, type ReactNode } from 'react';

import { Box, Drawer } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { MobileTopNavBar } from '../mobile-top-navbar';
import { Sidebar } from '../sidebar';
import { LAYOUT_DIMENSIONS } from './constants';

interface AdminMobileLayoutProps {
  children: ReactNode;
  onSignOut?: () => void;
}

export function AdminMobileLayout({
  children,
  onSignOut,
}: AdminMobileLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rescue = getRescueColorScheme(useTheme());

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateRows: `${LAYOUT_DIMENSIONS.mobileTopNavBarHeight}px minmax(0, 1fr)`,
        minHeight: '100dvh',
        bgcolor: rescue.adminShell.topNavBar.frame,
      }}
    >
      <Box sx={{ gridRow: 1, minWidth: 0 }}>
        <MobileTopNavBar onMenuClick={() => setDrawerOpen(true)} />
      </Box>

      <Box
        component="main"
        sx={{
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#444444',
        }}
      >
        {children}
      </Box>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { mobile: 'block', tablet: 'none' },
          '& .MuiDrawer-paper': {
            width: 'min(320px, calc(100vw - 40px))',
            maxWidth: 'calc(100vw - 40px)',
            overflow: 'hidden',
            bgcolor: 'transparent',
          },
        }}
      >
        <Sidebar
          open
          width="100%"
          minHeight="100dvh"
          showCloseButton
          onClose={() => setDrawerOpen(false)}
          onSignOut={onSignOut}
        />
      </Drawer>
    </Box>
  );
}
