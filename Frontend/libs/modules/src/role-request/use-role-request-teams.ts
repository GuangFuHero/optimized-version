'use client';

import { useCallback } from 'react';
import { useQuery } from 'urql';

import {
  RoleRequestTeamsDocument,
  type RoleRequestTeamType,
} from '@rescue-frontend/data-access';

// Inside the drawer: a list being read must not suspend the page around it. From the network each
// time: a team suspended or founded since the last read must not be offered, or be missing.
const ROLE_REQUEST_TEAMS_CONTEXT = { suspense: false } as const;

/**
 * The teams an applicant of `type` picks from (`roleRequestTeams`), read while the drawer is open;
 * nothing for an identity that names no team.
 */
export function useRoleRequestTeams(
  type: RoleRequestTeamType | null,
  active: boolean,
) {
  const [{ data, fetching, error, operation }, reexecute] = useQuery({
    query: RoleRequestTeamsDocument,
    variables: { type: type ?? 'GOV' },
    pause: !type || !active,
    requestPolicy: 'network-only',
    context: ROLE_REQUEST_TEAMS_CONTEXT,
  });
  const reload = useCallback(
    () => reexecute({ requestPolicy: 'network-only' }),
    [reexecute],
  );

  // The other type's list while this one is read is no list at all: a pick from it would be refused.
  const current = Boolean(type) && operation?.variables.type === type;

  return {
    teams: current && data ? data.roleRequestTeams : null,
    failed: current && Boolean(error) && !fetching,
    reload,
  };
}
