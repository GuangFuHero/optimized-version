'use client';

import {
  useTicketMapPins,
  type AdminTicketMapPinsQueryVariables,
} from '@rescue-frontend/data-access/admin';
import { useMemo } from 'react';

import { differsOnlyIn, TICKET_MAP_AREA_KEYS } from '../model/ticket-filters';
import { toTicketPin, type TicketPin } from '../model/ticket-row';

const NO_PINS: readonly TicketPin[] = [];

/**
 * The map's load of the tickets in view, as pins. The last pins stay up while the next load runs
 * when the two differ only in the map's area; a filter change shows as loading.
 */
export function useTicketPins(
  variables: AdminTicketMapPinsQueryVariables,
  options: { enabled?: boolean } = {},
) {
  const query = useTicketMapPins(variables, {
    enabled: options.enabled,
    keepPrevious: (previous) =>
      differsOnlyIn(previous, variables, TICKET_MAP_AREA_KEYS),
  });
  const pins = useMemo(
    () => query.data?.tickets.items.map(toTicketPin),
    [query.data],
  );
  return {
    pins: pins ?? NO_PINS,
    /** Every matching ticket in view, not just the ones loaded; null until known. */
    totalCount: query.data?.tickets.pageInfo.totalCount ?? null,
    /** The pins are the previous load's, kept up while this one runs. */
    isPlaceholderData: query.isPlaceholderData,
    error: query.error as unknown,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
