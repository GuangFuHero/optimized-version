'use client';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

/**
 * What the signed-in identity may do on this page, from the backend's capability list.
 *
 * Holding a capability means "on some station", not "on this one": edit, delete, history and
 * contacts are scoped per station, so a control on one station reads the station's own
 * `viewerCan*` fields instead (WG-168).
 */
export function useStationCapabilities() {
  const { data } = useCurrentUser();
  const has = (perm: components['schemas']['Perm']) =>
    data?.capabilities.includes(perm) ?? false;
  return {
    canAdd: has('station.add'),
    canEdit: has('station.edit'),
    canReview: has('station.review'),
    canAssign: has('station.assign'),
    canImport: has('station.import'),
    canExport: has('station.export'),
    canViewTeams: has('team.view'),
  };
}

export type StationCapabilities = ReturnType<typeof useStationCapabilities>;
