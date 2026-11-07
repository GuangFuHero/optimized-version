'use client';

import { GetMapAreasDocument } from '@rescue-frontend/data-access';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { siteGraphql, SITE_READ_OPTIONS } from '../../session/site-clients';
import type { RescueMapClosureArea, RescueMapPublicZone } from '../types';
import { fetchAllAreaPages } from '../site/area-pages';
import { mapAreasToOverlays } from '../site/markers';

const NO_AREAS = { closureAreas: [], publicZones: [], error: null };

export interface AdminMapAreas {
  closureAreas: readonly RescueMapClosureArea[];
  publicZones: readonly RescueMapPublicZone[];
  isFetching: boolean;
  error: unknown;
  hasFetchedOnce: boolean;
  /** Asks again, for after a change to an area; settles once the fresh answer is in. */
  reload: () => Promise<void>;
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
  const { data, isFetching, refetch } = useQuery({
    ...SITE_READ_OPTIONS,
    queryKey: ['admin-map', 'areas', { includePrivate }],
    queryFn: async ({ signal }) => {
      const { items, error } = await fetchAllAreaPages((skip, limit) =>
        siteGraphql(
          GetMapAreasDocument,
          { includePrivate, skip, limit },
          signal,
        ),
      );

      return { ...mapAreasToOverlays(items), error };
    },
    enabled,
  });
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    ...(data ?? NO_AREAS),
    isFetching,
    hasFetchedOnce: data !== undefined,
    reload,
  };
}
