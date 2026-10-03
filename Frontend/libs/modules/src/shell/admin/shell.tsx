'use client';

import { Box } from '@mui/material';
import { useState, type ReactNode } from 'react';

import { designTokens } from '@rescue-frontend/ui';

import { AdminHeader } from './header';
import { useActiveAdminNavItem } from './nav';
import { AdminSidebar } from './sidebar';

const { color } = designTokens;

export interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
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
          activeId={activeItem?.id}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <AdminHeader title={activeItem?.label} />
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
