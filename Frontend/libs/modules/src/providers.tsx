'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v13-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import { useState, type ReactNode } from 'react';

import { AuthSessionProvider } from './session/auth-session';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAdminQueryClient } from '@rescue-frontend/data-access/admin';
import { Toaster, toast } from 'sonner';
import { theme } from '@rescue-frontend/ui';

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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApplicationProviders>
  );
}
