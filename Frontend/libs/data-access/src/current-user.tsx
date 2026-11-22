// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import ApiError from './rest/api-error';
import { responseData, type createRestClient } from './rest/openapi-client';
import type { components } from './rest/openapi';

type RestClient = ReturnType<typeof createRestClient>;
type CurrentUser = components['schemas']['UserResponse'] | null;
const currentUserKey = ['currentUser'] as const;

export function currentUserQuery(client: RestClient) {
  return queryOptions({
    queryKey: currentUserKey,
    queryFn: async ({ signal }) => {
      try {
        return await client
          .GET('/api/v1/users/me', { signal, cache: 'no-store' })
          .then(responseData);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) return null;
        throw cause;
      }
    },
    retry: 2,
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

const CurrentUserContext = createContext<{
  queryClient: QueryClient;
  client: RestClient;
} | null>(null);

/** Session owns a cache that stays live while the signed-in identity's app cache is replaced. */
export function CurrentUserProvider({
  client,
  children,
}: {
  client: RestClient;
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <CurrentUserContext value={{ queryClient, client }}>
      {children}
    </CurrentUserContext>
  );
}

function useCurrentUserContext() {
  const session = useContext(CurrentUserContext);
  if (!session) throw new Error('CurrentUserProvider is missing');
  return session;
}

/** The profile is kept until invalidated; a reader of its mutable fields opts into `staleTime` or `refetchOnMount`. */
export function useCurrentUser<T = CurrentUser>({
  select,
  enabled,
  staleTime = Infinity,
  refetchOnMount,
}: {
  select?: (user: CurrentUser) => T;
  enabled?: boolean;
  staleTime?: number;
  refetchOnMount?: 'always';
} = {}) {
  const { queryClient, client } = useCurrentUserContext();
  return useQuery(
    {
      ...currentUserQuery(client),
      select,
      enabled,
      staleTime,
      refetchOnMount,
    },
    queryClient,
  );
}

export function useInvalidateCurrentUser(options?: { throwOnError?: boolean }) {
  const { queryClient } = useCurrentUserContext();
  return () =>
    queryClient.invalidateQueries({ queryKey: currentUserKey }, options);
}
