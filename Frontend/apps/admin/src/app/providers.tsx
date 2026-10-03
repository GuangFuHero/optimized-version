'use client';

import { createAdminQueryClient } from '@rescue-frontend/data-access/admin';
import { ApiError, createUrqlClient } from '@rescue-frontend/data-access';
import {
  ApplicationProviders,
  sessionExpiryFetch,
} from '@rescue-frontend/modules';
import { signOut, useSession } from 'next-auth/react';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Provider as UrqlProvider } from 'urql';

function BackendProvider({ children }: { children: ReactNode }) {
  const [graphqlClient] = useState(() =>
    createUrqlClient({
      runtime: 'client',
      url: '/api/graphql',
      fetch: sessionExpiryFetch,
    }),
  );
  const [queryClient] = useState(() =>
    createAdminQueryClient((error) => {
      toast.error(error.message);
      if (error instanceof ApiError && error.status === 401) {
        void signOut({ callbackUrl: '/login?callbackUrl=/' });
      }
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <UrqlProvider value={graphqlClient}>{children}</UrqlProvider>
    </QueryClientProvider>
  );
}

function SessionQueries({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  return (
    <BackendProvider key={session?.user?.id ?? status}>
      {children}
    </BackendProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApplicationProviders>
      <SessionQueries>{children}</SessionQueries>
    </ApplicationProviders>
  );
}
