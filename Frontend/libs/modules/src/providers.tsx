// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v13-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import { useState, type ReactNode } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { AuthSessionProvider } from './session/auth-session';
import {
  ApiError,
  CurrentUserProvider,
  createAppQueryClient,
  isPermissionError,
} from '@rescue-frontend/data-access';
import { siteRestClient } from './session/site-clients';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { theme } from '@rescue-frontend/ui';

export function ApplicationProviders({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <AppRouterCacheProvider>
        <CurrentUserProvider client={siteRestClient}>
          <AuthSessionProvider>
            <ThemeProvider
              theme={theme}
              defaultMode="light"
              storageManager={null}
              modeStorageKey="mui-mode-disabled"
              colorSchemeStorageKey="mui-color-scheme-disabled"
            >
              {children}
              <Toaster richColors closeButton />
            </ThemeProvider>
          </AuthSessionProvider>
        </CurrentUserProvider>
      </AppRouterCacheProvider>
    </NuqsAdapter>
  );
}

export function SiteProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() =>
    createAppQueryClient((error) => {
      // `sessionExpiryFetch` reloads a tab whose session ended; any other 401, such as a wrong
      // password, is explained where it happened.
      if (!(error instanceof ApiError && error.status === 401))
        toast.error(error.message);
    }, isPermissionError),
  );
  return (
    <ApplicationProviders>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApplicationProviders>
  );
}
