// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { adminMapAreasQuery } from '@rescue-frontend/data-access/admin';
import { useQuery } from '@tanstack/react-query';

import type { RescueMapClosureArea, RescueMapPublicZone } from '../types';
import { mapAreasToOverlays } from '../markers';

const NO_AREAS = { closureAreas: [], publicZones: [] };

export interface AdminMapAreas {
  closureAreas: readonly RescueMapClosureArea[];
  publicZones: readonly RescueMapPublicZone[];
  isFetching: boolean;
  hasError: boolean;
  hasFetchedOnce: boolean;
  /** True when there are more areas than the map reads, so the list is not all of them. */
  truncated: boolean;
}

/**
 * Every area, the 標示區 not shown to the public among them (`includePrivate`, which the backend
 * allows to `work_zone.view` holders; the rest are asked for the public ones only). Unlike the public map's, they are not limited to the map's
 * view: the list panel names all of them, and one that is off screen can be zoomed to.
 */
export function useAdminMapAreas({
  enabled,
  includePrivate = true,
}: {
  enabled: boolean;
  /** Without it, only what the public map shows: for those who may not see work zones. */
  includePrivate?: boolean;
}): AdminMapAreas {
  const { data, isFetching, isError } = useQuery({
    ...adminMapAreasQuery(includePrivate),
    enabled,
    select: ({ items, hasError, truncated }) => ({
      ...mapAreasToOverlays(items),
      hasError,
      truncated,
    }),
  });
  return {
    ...(data ?? NO_AREAS),
    isFetching,
    hasFetchedOnce: data !== undefined,
    hasError: isError || (data?.hasError ?? false),
    truncated: data?.truncated ?? false,
  };
}
