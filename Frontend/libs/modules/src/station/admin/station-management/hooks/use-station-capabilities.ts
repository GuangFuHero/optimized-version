'use client';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';

/** What the signed-in identity may do on this page, from the backend's capability list. */
export function useStationCapabilities() {
  const { data } = useCurrentUser();
  const has = (perm: string) => data?.capabilities.includes(perm as never) ?? false;
  return {
    canAdd: has('station.add'),
    canEdit: has('station.edit'),
    canDelete: has('station.delete'),
    canReview: has('station.review'),
    canAssign: has('station.assign'),
    canImport: has('station.import'),
    canExport: has('station.export'),
    canViewHistory: has('station.view_history'),
    canViewPii: has('station.view_pii'),
    canViewTeams: has('team.view'),
  };
}

export type StationCapabilities = ReturnType<typeof useStationCapabilities>;
