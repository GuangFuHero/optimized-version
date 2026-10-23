'use client';

import { createAdminQueryClient } from '@rescue-frontend/data-access/admin';
import { ApiError } from '@rescue-frontend/data-access';
import {
  ApplicationProviders,
  endExpiredSession,
  useAuthSession,
} from '@rescue-frontend/modules';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

// The proxy refreshes a spent access token itself, so any other 401 is a session that has ended,
// except a wrong password or step-up proof, which ends nothing.
const SESSION_KEEPING_CODES = new Set([
  'password_incorrect',
  'step_up_invalid',
]);

function BackendProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() =>
    createAdminQueryClient((error) => {
      toast.error(error.message);
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        !SESSION_KEEPING_CODES.has(error.code ?? '')
      ) {
        endExpiredSession();
      }
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function SessionQueries({ children }: { children: ReactNode }) {
  const { user, status } = useAuthSession();
  return (
    <BackendProvider key={user?.uuid ?? status}>{children}</BackendProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApplicationProviders>
      <SessionQueries>{children}</SessionQueries>
    </ApplicationProviders>
  );
}
