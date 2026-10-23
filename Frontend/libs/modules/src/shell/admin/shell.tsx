'use client';

import { Box } from '@mui/material';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import {
  AnnouncementFilter,
  isAdminPermissionError,
  useAnnouncements,
  useCurrentUser,
} from '@rescue-frontend/data-access/admin';
import { AnnouncementBanner, designTokens } from '@rescue-frontend/ui';

import { AdminHeader } from './header';
import { AdminErrorPage } from './error-page';
import { useActiveAdminNavItem } from './nav';
import { AdminSidebar } from './sidebar';

const { color } = designTokens;

export interface AdminShellProps {
  children: ReactNode;
  notFound?: boolean;
}

export function AdminShell({ children, notFound = false }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const matchedItem = useActiveAdminNavItem();
  const activeItem = notFound ? undefined : matchedItem;
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const queryCache = useQueryClient().getQueryCache();
  const queryForbidden = useSyncExternalStore(
    queryCache.subscribe,
    () =>
      queryCache
        .findAll({ queryKey: ['admin'], type: 'active' })
        .some((query) => isAdminPermissionError(query.state.error)),
    () => false,
  );
  const capabilityForbidden = Boolean(
    activeItem?.capability &&
      user &&
      !user.capabilities.includes(activeItem.capability),
  );
  const forbidden = !notFound && (capabilityForbidden || queryForbidden);
  const pageTitle =
    forbidden || pathname === '/forbidden'
      ? '沒有權限訪問此頁'
      : notFound
        ? '找不到這一頁'
        : activeItem?.label;
  const canViewAnnouncements = Boolean(
    user?.capabilities.includes('announcement.view_admin'),
  );
  const { data } = useAnnouncements(
    { filter: AnnouncementFilter.Active },
    { enabled: canViewAnnouncements },
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      {canViewAnnouncements &&
        data?.announcements.map((announcement) => (
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
        <AdminSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          activeId={forbidden ? undefined : activeItem?.id}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <AdminHeader title={pageTitle} />
          <Box
            component="main"
            sx={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'auto',
            }}
          >
            {forbidden ? <AdminErrorPage code="403" /> : null}
            {!capabilityForbidden ? (
              // Keep query observers mounted so an identity switch can refetch the failed page.
              <Box sx={{ display: forbidden ? 'none' : 'contents' }}>
                {children}
              </Box>
            ) : null}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
