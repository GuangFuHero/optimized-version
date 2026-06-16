'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v13-appRouter';
import { SessionProvider } from 'next-auth/react';
import React from 'react';
import ThemeProvider from './theme.provider';
import PortalUrqlClientProvider from './urql.provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => {
  return (
    <AppRouterCacheProvider>
      <SessionProvider>
        <ThemeProvider>
          <PortalUrqlClientProvider>{children}</PortalUrqlClientProvider>
        </ThemeProvider>
      </SessionProvider>
    </AppRouterCacheProvider>
  );
};
