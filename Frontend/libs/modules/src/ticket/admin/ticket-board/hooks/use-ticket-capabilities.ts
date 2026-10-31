'use client';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

/**
 * What the signed-in identity may do on the ticket board as a whole, from the backend's
 * capability list: the toolbar's 新增, 匯入 and 匯出. What may be done to one ticket (edit, delete,
 * history, its needs) is that ticket's `viewerCan*`, scoped to it.
 */
export function useTicketCapabilities() {
  const { data } = useCurrentUser();
  const has = (perm: components['schemas']['Perm']) =>
    data?.capabilities.includes(perm) ?? false;
  return {
    canAdd: has('ticket.add'),
    canImport: has('ticket.import'),
    canExport: has('ticket.export'),
  };
}

export type TicketCapabilities = ReturnType<typeof useTicketCapabilities>;
