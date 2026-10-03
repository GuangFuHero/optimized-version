'use client';

import { useCallback } from 'react';
import { useQuery } from 'urql';

import { MyRoleRequestsDocument } from '@rescue-frontend/data-access';

// The entry sits in the shell: it must never suspend the page around it.
const MY_ROLE_REQUESTS_CONTEXT = { suspense: false } as const;

/**
 * The caller's applications and whether they hold a back-office identity, read live; nothing for a
 * guest. The shell asks once and hands it to both the entry and the drawer. `refetch` goes to the
 * network: graphcache cannot key `RoleRequestType` by `uuid`, so a mutation does not update it.
 */
export function useMyRoleRequests(isAuthenticated: boolean) {
  const [{ data }, reexecute] = useQuery({
    query: MyRoleRequestsDocument,
    pause: !isAuthenticated,
    context: MY_ROLE_REQUESTS_CONTEXT,
  });
  const refetch = useCallback(
    () => reexecute({ requestPolicy: 'network-only' }),
    [reexecute],
  );

  return { myRoleRequests: data?.myRoleRequests ?? null, refetch };
}
