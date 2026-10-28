import type { AdminTicketQuery } from '@rescue-frontend/data-access/admin';

import { formatTicketStreet, formatTicketUnit } from '../../../address';
import {
  formatTicketStatusLabel,
  getTicketPriorityBadge,
} from '../../../status';
import { AUDIT_BADGES, UNTITLED_TICKET, type AuditStatus } from './ticket-row';

export type DetailTicket = NonNullable<AdminTicketQuery['ticket']>;

/** A link that opens a ticket's drawer on the board, e.g. from an admin notification. */
export function adminTicketHref(uuid: string): string {
  return `/tickets?ticket=${encodeURIComponent(uuid)}`;
}

export type TicketDetailState = 'loading' | 'missing' | 'ready';

/**
 * What the drawer shows for a `useTicket` query. An error is 'missing' even while the query still
 * reports pending (it may be retrying), so the drawer never spins on a failure.
 */
export function ticketDetailState(query: {
  isPending: boolean;
  error: unknown;
  data?: { ticket?: unknown | null };
}): TicketDetailState {
  if (query.error) return 'missing';
  if (query.data?.ticket) return 'ready';
  return query.isPending ? 'loading' : 'missing';
}

/** What `TicketDetailSheet` shows for a ticket, ready to render. */
export interface TicketDetailView {
  title: string;
  statusLabel: string;
  priorityLabel: string;
  auditLabel: string;
  /** As the API returned it; the sheet formats it for display. */
  updatedAt: string | null;
  location:
    | { kind: 'exact'; address: string; floorRoom: string | null }
    | { kind: 'coarse' };
  /** Null on a coarse ticket (no detail permission) and when no contact field is filled. */
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  disasterLabels: string[];
  disasterDetails: { label: string; value: string }[];
  description: string | null;
}

const PRIORITY_LABELS: Record<string, string> = {
  medium: '中優先',
  low: '低優先',
};

/** A priority as words: the badge's for the top two, these below them. */
export function ticketPriorityLabel(priority: string): string {
  return (
    getTicketPriorityBadge(priority)?.label ?? PRIORITY_LABELS[priority] ?? '—'
  );
}

const text = (value: string | null | undefined) => value?.trim() || null;

function contactOf(ticket: DetailTicket): TicketDetailView['contact'] {
  const contact = {
    name: text(ticket.contactName),
    phone: text(ticket.contactPhone),
    email: text(ticket.contactEmail),
  };
  return contact.name || contact.phone || contact.email ? contact : null;
}

export function toTicketDetailView(
  ticket: DetailTicket,
  disasterLabels: Record<string, string>,
): TicketDetailView {
  // BE-026: a coarse ticket is one the viewer may not see in detail — no address, no contact.
  const coarse = Boolean(ticket.locationCell);
  return {
    title: text(ticket.title) ?? UNTITLED_TICKET,
    statusLabel: formatTicketStatusLabel(ticket.status),
    priorityLabel: ticketPriorityLabel(ticket.priority),
    auditLabel:
      AUDIT_BADGES[ticket.auditStatus as AuditStatus]?.label ??
      ticket.auditStatus,
    updatedAt: ticket.updatedAt ?? null,
    location: coarse
      ? { kind: 'coarse' }
      : {
          kind: 'exact',
          address: formatTicketStreet(ticket.secondaryLocation) ?? '未提供地址',
          floorRoom: formatTicketUnit(ticket.secondaryLocation),
        },
    contact: coarse ? null : contactOf(ticket),
    disasterLabels: ticket.disasterTypes.map(
      (key) => disasterLabels[key] ?? key,
    ),
    disasterDetails: ticket.disasterDetails.map((detail) => ({
      label: detail.propertyName,
      value: detail.value,
    })),
    description: text(ticket.description),
  };
}
