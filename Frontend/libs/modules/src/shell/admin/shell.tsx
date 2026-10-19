'use client';

import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import { useState, type ReactNode } from 'react';

import {
  AnnouncementFilter,
  useAnnouncements,
} from '@rescue-frontend/data-access/admin';
import { AnnouncementBanner, designTokens } from '@rescue-frontend/ui';

import { AdminHeader } from './header';
import { useActiveAdminNavItem } from './nav';
import { AdminSidebar } from './sidebar';

const { color } = designTokens;

export interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('tablet'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const activeItem = useActiveAdminNavItem();
  const { data } = useAnnouncements({ filter: AnnouncementFilter.Active });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      {data?.announcements.map((announcement) => (
        <AnnouncementBanner key={announcement.uuid}>
          {announcement.content}
        </AnnouncementBanner>
      ))}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          bgcolor: color.bg.neutral.subtle,
        }}
      >
        {mobile ? (
          <Drawer
            open={mobileOpen}
            transitionDuration={reduceMotion ? 0 : undefined}
            onClose={() => setMobileOpen(false)}
            slotProps={{
              paper: {
                id: 'admin-mobile-navigation',
                sx: { maxWidth: '85vw' },
              },
            }}
          >
            <Box
              sx={{ display: 'flex', height: '100%' }}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a[href]'))
                  setMobileOpen(false);
              }}
            >
              <AdminSidebar
                collapsed={false}
                onToggle={() => setMobileOpen(false)}
                activeId={activeItem?.id}
              />
            </Box>
          </Drawer>
        ) : (
          <AdminSidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
            activeId={activeItem?.id}
          />
        )}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <AdminHeader
            title={activeItem?.label}
            onOpenNavigation={() => setMobileOpen(true)}
            navigationOpen={mobileOpen}
          />
          <Box
            component="main"
            sx={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'auto',
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
