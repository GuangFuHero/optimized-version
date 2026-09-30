'use client';

import { useQuery } from 'urql';

import { MyRoleRequestsDocument } from '@rescue-frontend/data-access';

import { sitePortalEntry, type SitePortalEntry } from './portal-entry';

// The entry sits in the shell: it must never suspend the page around it.
const PORTAL_QUERY_CONTEXT = { suspense: false } as const;

/** Which back-office entry to show, read live for the signed-in caller; `none` for a guest. */
export function useSitePortalEntry(isAuthenticated: boolean): SitePortalEntry {
  const [{ data }] = useQuery({
    query: MyRoleRequestsDocument,
    pause: !isAuthenticated,
    context: PORTAL_QUERY_CONTEXT,
  });

  return sitePortalEntry(isAuthenticated, data?.myRoleRequests);
}
