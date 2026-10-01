'use client';

import {
  createUrqlClient,
  createUrqlExchanges,
} from '@rescue-frontend/data-access';
import { sessionExpiryFetch } from '@rescue-frontend/modules';
import { UrqlProvider, ssrExchange } from '@urql/next';
import { useState } from 'react';

interface PortalUrqlProviderProps {
  children: React.ReactNode;
}

export default function PortalUrqlClientProvider({
  children,
}: PortalUrqlProviderProps) {
  const [{ client, ssr }] = useState(() => {
    const ssr = ssrExchange({
      isClient: typeof window !== 'undefined',
    });

    const client = createUrqlClient({
      runtime: 'client',
      url: '/api/graphql',
      exchanges: createUrqlExchanges(ssr),
      // A session that ended elsewhere signs out and reloads as a guest (note/session-expiry-spec.md).
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
