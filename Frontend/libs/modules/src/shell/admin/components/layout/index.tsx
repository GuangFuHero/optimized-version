'use client';

import type { ReactNode } from 'react';

import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { AdminDesktopLayout } from './desktop-layout';
import { AdminMobileLayout } from './mobile-layout';

interface AdminLayoutProps {
  children: ReactNode;
  onSignOut?: () => void;
}

export function AdminLayout({ children, onSignOut }: AdminLayoutProps) {
  const theme = useTheme();
  const isDesktopShell = useMediaQuery(theme.breakpoints.up('tablet'));

  return isDesktopShell ? (
    <AdminDesktopLayout onSignOut={onSignOut}>{children}</AdminDesktopLayout>
  ) : (
    <AdminMobileLayout onSignOut={onSignOut}>{children}</AdminMobileLayout>
  );
}
