'use client';

import { stationsQuery } from '@rescue-frontend/data-access/admin';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { collectAllPages } from '../model/collect-pages';
import {
  toServerVariables,
  type StationFilters,
} from '../model/station-filters';
import { toStationRow } from '../model/station-row';

export function useAllStations(
  filters: StationFilters,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const variables = toServerVariables(filters);
  return useQuery({
    queryKey: ['admin', 'stations', 'all', variables],
    enabled: options.enabled,
    queryFn: async () => {
      const { items, truncated } = await collectAllPages(
        async (skip, limit) => {
          const data = await queryClient.fetchQuery(
            stationsQuery({ ...variables, skip, limit }),
          );
          return {
            items: data.stations.items,
            hasNextPage: data.stations.pageInfo.hasNextPage,
          };
        },
      );
      return { rows: items.map(toStationRow), truncated };
    },
  });
}
