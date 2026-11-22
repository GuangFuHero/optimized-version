// SPDX-License-Identifier: GPL-3.0-only
import { queryOptions } from '@tanstack/react-query';
import {
  GetAdminMapTicketsDocument,
  GetMapAreasDocument,
  GetStationsDocument,
  RoleRequestTeamsDocument,
  type BoundsInput,
} from '../graphql/__generated__/graphql';
import { GraphqlError } from '../graphql/request';
import { fetchAllAreaPages } from '../graphql/read-map-areas';
import { adminGraphql } from './client';
import { adminMapKeys } from './map-query-keys';
import { SILENT_ERROR_META } from '../query-client';

export const ADMIN_MAP_LIVE_QUERY_LIMIT = 200;

const ownErrorState = { [SILENT_ERROR_META]: true };

export const adminMapAreasQuery = (includePrivate: boolean) =>
  queryOptions({
    queryKey: [...adminMapKeys.areas, { includePrivate }],
    meta: ownErrorState,
    queryFn: async ({ signal }) => {
      const { items, errors, truncated } = await fetchAllAreaPages(
        (skip, limit) =>
          adminGraphql(
            GetMapAreasDocument,
            { includePrivate, skip, limit },
            signal,
          ),
      );
      // A session that ended fails every page the same way, so it is not a partial read.
      const ended = errors.find(
        (error) =>
          error instanceof GraphqlError && error.response?.status === 401,
      );
      if (ended) throw ended;
      // With no first page there is nothing to stand in for the areas.
      if (items.length === 0 && errors.length > 0) throw errors[0];
      return { items, hasError: errors.length > 0, truncated };
    },
  });

export const adminMapTicketsQuery = (
  bounds: BoundsInput | undefined,
  zoom: number | undefined,
) =>
  queryOptions({
    queryKey: [...adminMapKeys.markers, 'tickets', { bounds, zoom }],
    meta: ownErrorState,
    enabled: Boolean(bounds),
    queryFn: ({ signal }) =>
      adminGraphql(
        GetAdminMapTicketsDocument,
        {
          bounds,
          zoom,
          skip: 0,
          limit: ADMIN_MAP_LIVE_QUERY_LIMIT,
        },
        signal,
      ),
  });

export const adminMapStationsQuery = (bounds: BoundsInput | undefined) =>
  queryOptions({
    queryKey: [...adminMapKeys.markers, 'stations', { bounds }],
    meta: ownErrorState,
    enabled: Boolean(bounds),
    queryFn: ({ signal }) =>
      adminGraphql(
        GetStationsDocument,
        {
          bounds,
          skip: 0,
          limit: ADMIN_MAP_LIVE_QUERY_LIMIT,
        },
        signal,
      ),
  });

/** The same slim active NGO list used by role requests, under the admin team cache. */
export const adminZoneTeamsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'teams', 'zoneOptions'],
    meta: ownErrorState,
    queryFn: ({ signal }) =>
      adminGraphql(RoleRequestTeamsDocument, { type: 'NGO' }, signal),
  });
