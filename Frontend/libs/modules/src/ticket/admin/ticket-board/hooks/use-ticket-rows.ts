'use client';

import { useAllTickets } from '@rescue-frontend/data-access/admin';
import { useMemo } from 'react';

import { toServerVariables, type TicketFilters } from '../model/ticket-filters';
import { toTicketRow, type TicketRow } from '../model/ticket-row';

const NO_ROWS: readonly TicketRow[] = [];

export function useTicketRows(
  filters: TicketFilters,
  options: { enabled?: boolean } = {},
) {
  const query = useAllTickets(toServerVariables(filters), options);
  const rows = useMemo(() => query.data?.items.map(toTicketRow), [query.data]);
  return {
    rows: rows ?? NO_ROWS,
    truncated: query.data?.truncated ?? false,
    isPending: query.isPending,
    error: query.error as unknown,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
