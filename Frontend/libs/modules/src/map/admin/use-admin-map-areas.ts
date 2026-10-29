'use client';

import {
  GetMapAreasDocument,
  createUrqlClient,
} from '@rescue-frontend/data-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchExchange, type CombinedError } from 'urql';

import { sessionExpiryFetch } from '../../session/end-expired-session';
import type { RescueMapClosureArea, RescueMapPublicZone } from '../types';
import { fetchAllAreaPages } from '../site/area-pages';
import { mapAreasToOverlays } from '../site/markers';

export interface AdminMapAreas {
  closureAreas: readonly RescueMapClosureArea[];
  publicZones: readonly RescueMapPublicZone[];
  isFetching: boolean;
  error: CombinedError | null;
  hasFetchedOnce: boolean;
  /** Asks again, for after a change to an area. */
  reload: () => void;
}

const EMPTY_AREAS = {
  closureAreas: [] as readonly RescueMapClosureArea[],
  publicZones: [] as readonly RescueMapPublicZone[],
  isFetching: false,
  error: null as CombinedError | null,
  hasFetchedOnce: false,
};

/**
 * Every area, the 標示區 not shown to the public among them (`includePrivate`, which the backend
 * allows to `work_zone.view` holders). Unlike the public map's, they are not limited to the map's
 * view: the list panel names all of them, and one that is off screen can be zoomed to.
 */
export function useAdminMapAreas({
  enabled,
}: {
  enabled: boolean;
}): AdminMapAreas {
  const client = useMemo(
    () =>
      createUrqlClient({
        runtime: 'client',
        url: '/api/graphql',
        exchanges: [fetchExchange],
        fetch: sessionExpiryFetch,
        requestPolicy: 'network-only',
        suspense: false,
      }),
    [],
  );
  const [areas, setAreas] = useState(EMPTY_AREAS);
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((count) => count + 1), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    setAreas((current) => ({ ...current, isFetching: true }));

    void fetchAllAreaPages((skip, limit) =>
      client
        .query(
          GetMapAreasDocument,
          { includePrivate: true, skip, limit },
          { requestPolicy: 'network-only', suspense: false },
        )
        .toPromise(),
    ).then((result) => {
      if (cancelled) {
        return;
      }

      const { closureAreas, publicZones } = mapAreasToOverlays(result.items);

      setAreas({
        closureAreas,
        publicZones,
        isFetching: false,
        error: result.error,
        hasFetchedOnce: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [client, enabled, reloads]);

  return { ...areas, reload };
}
