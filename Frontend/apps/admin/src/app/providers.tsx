'use client';

import {
  createAppQueryClient,
  isPermissionError,
  isSessionEndError,
  useCurrentUser,
} from '@rescue-frontend/data-access';
import {
  ApplicationProviders,
  AdminAreaChangesProvider,
  endExpiredSession,
  useAuthSession,
} from '@rescue-frontend/modules';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

function BackendProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() =>
    createAppQueryClient((error) => {
      if (isSessionEndError(error)) {
        endExpiredSession();
        return;
      }
      toast.error(error.message);
    }, isPermissionError),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAreaChangesProvider>{children}</AdminAreaChangesProvider>
    </QueryClientProvider>
  );
}

function SessionQueries({ children }: { children: ReactNode }) {
  const { user, status } = useAuthSession();
  const identity = useCurrentUser().data?.active_identity;
  const key = user
    ? `${user.uuid}:${identity?.role_uuid ?? ''}:${identity?.team_uuid ?? ''}`
    : status;
  return <BackendProvider key={key}>{children}</BackendProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApplicationProviders>
      <SessionQueries>{children}</SessionQueries>
    </ApplicationProviders>
  );
}
