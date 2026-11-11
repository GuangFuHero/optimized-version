'use client';

import { useQuery } from '@tanstack/react-query';

import { MyRoleRequestsDocument } from '@rescue-frontend/data-access';

import { siteGraphqlQuery } from '../session/site-clients';

/**
 * The caller's applications and whether they hold a back-office identity, read live; nothing for a
 * guest. The shell asks once and hands it to both the entry and the drawer.
 */
export function useMyRoleRequests(isAuthenticated: boolean) {
  const { data, refetch } = useQuery({
    ...siteGraphqlQuery(MyRoleRequestsDocument, {}),
    enabled: isAuthenticated,
  });

  return { myRoleRequests: data?.myRoleRequests ?? null, refetch };
}
