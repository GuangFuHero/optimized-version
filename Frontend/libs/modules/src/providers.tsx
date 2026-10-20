'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v13-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import { UrqlProvider, ssrExchange } from '@urql/next';
import { useState, type ReactNode } from 'react';

import {
  createUrqlClient,
  createUrqlExchanges,
} from '@rescue-frontend/data-access';
import { AuthSessionProvider } from './session/auth-session';
import { sessionExpiryFetch } from './session/end-expired-session';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAdminQueryClient } from '@rescue-frontend/data-access/admin';
import { Toaster, toast } from 'sonner';
import { theme } from '@rescue-frontend/ui';

function PortalUrqlClientProvider({ children }: { children: ReactNode }) {
  const [{ client, ssr }] = useState(() => {
    const ssr = ssrExchange({
      isClient: typeof window !== 'undefined',
    });

    const client = createUrqlClient({
      runtime: 'client',
      url: '/api/graphql',
      exchanges: createUrqlExchanges(ssr),
      fetch: sessionExpiryFetch,
      suspense: true,
    });

    return { client, ssr };
  });

  return (
    <UrqlProvider client={client} ssr={ssr}>
      {children}
    </UrqlProvider>
  );
}

export function ApplicationProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider>
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
    </AppRouterCacheProvider>
  );
}

export function SiteProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() =>
    createAdminQueryClient((error) => toast.error(error.message)),
  );
  return (
    <ApplicationProviders>
      <QueryClientProvider client={queryClient}>
        <PortalUrqlClientProvider>{children}</PortalUrqlClientProvider>
      </QueryClientProvider>
    </ApplicationProviders>
  );
}
