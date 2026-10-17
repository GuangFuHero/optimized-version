'use client';

import { useCurrentUser, useTeams } from '@rescue-frontend/data-access/admin';

export function useAnnouncementAccess() {
  const user = useCurrentUser();
  const identity = user.data?.active_identity;
  const needsTeam = Boolean(identity?.team_uuid);
  const teams = useTeams({ enabled: needsTeam });
  const team = teams.data?.find((team) => team.uuid === identity?.team_uuid);

  return {
    user: user.data,
    canManage:
      (!identity?.team_uuid && identity?.role === 'super_admin') ||
      team?.type === 'gov',
    isPending: user.isPending || (needsTeam && teams.isPending),
    isError: user.isError || (needsTeam && teams.isError),
    refetch: () => {
      void user.refetch();
      if (needsTeam) void teams.refetch();
    },
  };
}
