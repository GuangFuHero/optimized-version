'use client';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

/** What the signed-in identity may do on this page, from the backend's capability list. */
export function useStationCapabilities() {
  const { data } = useCurrentUser();
  const has = (perm: components['schemas']['Perm']) =>
    data?.capabilities.includes(perm) ?? false;
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
