'use client';

import {
  useTickets,
  type AdminTicketsQueryVariables,
} from '@rescue-frontend/data-access/admin';
import { useMemo } from 'react';

import { differsOnlyIn } from '../model/ticket-filters';
import { toTicketRow, type TicketRow } from '../model/ticket-row';

const NO_ROWS: readonly TicketRow[] = [];

/**
 * One page of `tickets` as board rows. The last result stays on screen while the next loads only
 * when the two differ just in `keepAcross` (the page); any other change shows as loading.
 */
export function useTicketRows(
  variables: AdminTicketsQueryVariables,
  options: {
    enabled?: boolean;
    keepAcross?: readonly (keyof AdminTicketsQueryVariables)[];
  } = {},
) {
  const { enabled, keepAcross } = options;
  const query = useTickets(variables, {
    enabled,
    keepPrevious: keepAcross
      ? (previous) => differsOnlyIn(previous, variables, keepAcross)
      : false,
  });
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
