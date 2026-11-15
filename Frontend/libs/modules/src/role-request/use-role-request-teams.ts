'use client';

import { useQuery } from '@tanstack/react-query';

import {
  RoleRequestTeamsDocument,
  type RoleRequestTeamType,
} from '@rescue-frontend/data-access';

import { siteGraphqlQuery } from '../session/site-clients';

/**
 * The teams an applicant of `type` picks from (`roleRequestTeams`), read from the network each
 * time the drawer opens: a team suspended or founded since the last read must not be offered, or
 * be missing. Nothing for an identity that names no team.
 */
export function useRoleRequestTeams(
  type: RoleRequestTeamType | null,
  active: boolean,
) {
  const { data, isError, isFetching, refetch } = useQuery({
    ...siteGraphqlQuery(RoleRequestTeamsDocument, { type: type ?? 'GOV' }),
    enabled: Boolean(type) && active,
  });

  // Keyed by type, so the other type's list never stands in for this one: a pick from it would be
  // refused.
  return {
    teams: type && data ? data.roleRequestTeams : null,
    failed: Boolean(type) && isError && !isFetching,
    reload: refetch,
  };
}
