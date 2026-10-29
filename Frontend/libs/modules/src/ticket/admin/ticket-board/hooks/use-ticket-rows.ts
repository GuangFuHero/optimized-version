'use client';

import {
  useTickets,
  type AdminTicketsQueryVariables,
} from '@rescue-frontend/data-access/admin';
import { useMemo } from 'react';

import { toTicketRow, type TicketRow } from '../model/ticket-row';

const NO_ROWS: readonly TicketRow[] = [];

/**
 * One load of `tickets` as board rows: a list page, or the map's visible area. The last result
 * stays on screen while the next page or area loads.
 */
export function useTicketRows(
  variables: AdminTicketsQueryVariables,
  options: { enabled?: boolean } = {},
) {
  const query = useTickets(variables, { ...options, keepPrevious: true });
  const rows = useMemo(
    () => query.data?.tickets.items.map(toTicketRow),
    [query.data],
  );
  return {
    rows: rows ?? NO_ROWS,
    /** Every ticket matching the variables, not just the ones loaded; null until known. */
    totalCount: query.data?.tickets.pageInfo.totalCount ?? null,
    isPending: query.isPending,
    /** The rows are the previous load's, kept on screen while this one runs. */
    isPlaceholderData: query.isPlaceholderData,
    error: query.error as unknown,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
