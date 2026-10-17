'use client';

import { Box } from '@mui/material';
import { useState, type ReactNode } from 'react';

import { AnnouncementBanner, designTokens } from '@rescue-frontend/ui';

import type { AdminUser } from './account-menu';
import { AdminHeader } from './header';
import { useActiveAdminNavItem } from './nav';
import { AdminSidebar, type AdminEvent } from './sidebar';

const { color } = designTokens;

export interface AdminShellProps {
  event: AdminEvent;
  user: AdminUser;
  announcement?: ReactNode;
  onSignOut?: () => void;
  children: ReactNode;
}

export function AdminShell({
  event,
  user,
  announcement,
  onSignOut,
  children,
}: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const activeItem = useActiveAdminNavItem();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      {announcement ? (
        <AnnouncementBanner>{announcement}</AnnouncementBanner>
      ) : null}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          bgcolor: color.bg.neutral.subtle,
        }}
      >
        <AdminSidebar
          event={event}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          activeId={activeItem?.id}
          onSignOut={onSignOut}
        />
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
            user={user}
            onSignOut={onSignOut}
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
