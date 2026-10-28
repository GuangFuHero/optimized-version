'use client';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

/** What the signed-in identity may do on the ticket board, from the backend's capability list. */
export function useTicketCapabilities() {
  const { data } = useCurrentUser();
  const has = (perm: components['schemas']['Perm']) =>
    data?.capabilities.includes(perm) ?? false;
  return {
    canAdd: has('ticket.add'),
    canEdit: has('ticket.edit'),
    canDelete: has('ticket.delete'),
    canAudit: has('ticket.audit'),
    canImport: has('ticket.import'),
    canExport: has('ticket.export'),
    canViewDetail: has('ticket.view_detail'),
    canViewHistory: has('ticket.view_history'),
  };
}

export type TicketCapabilities = ReturnType<typeof useTicketCapabilities>;
