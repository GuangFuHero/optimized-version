import type {
  AdminTicketPropertyConfigsQuery,
  AdminTicketQuery,
} from '@rescue-frontend/data-access/admin';

import { formatTicketStreet, formatTicketUnit } from '../../../address';
import { formatTicketStatusLabel } from '../../../status';
import { adminTicketPriorityLabel } from './ticket-priority';
import { AUDIT_BADGES, UNTITLED_TICKET, type AuditStatus } from './ticket-row';

export type DetailTicket = NonNullable<AdminTicketQuery['ticket']>;

/** What the drawer reads from a disaster-specific field's config: its label and its unit. */
export type DisasterFieldConfig = Pick<
  AdminTicketPropertyConfigsQuery['ticketPropertyConfigs'][number],
  'propertyName' | 'displayLabel' | 'dataType' | 'unit'
>;

/** A link that opens a ticket's drawer on the board, e.g. from an admin notification. */
export function adminTicketHref(uuid: string): string {
  return `/tickets?ticket=${encodeURIComponent(uuid)}`;
}

export type TicketDetailState = 'loading' | 'missing' | 'failed' | 'ready';

/**
 * What the drawer shows for a `useTicket` query. A loaded ticket stays 'ready' through a failed
 * background refetch (TanStack keeps its data), so a network blip never unmounts the drawer or an
 * edit in progress. With nothing loaded, an error is 'failed' (worth a retry) even while the query
 * still reports pending, so the drawer never spins on a failure; a null ticket is 'missing'
 * (not found, or not ours to see).
 */
export function ticketDetailState(query: {
  isPending: boolean;
  error: unknown;
  data?: { ticket?: unknown | null };
}): TicketDetailState {
  if (query.data?.ticket) return 'ready';
  if (query.error) return 'failed';
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
  /**
   * The viewer lacks ticket.view_detail here (a coarse ticket): contact, description and photos
   * arrive empty because they are withheld, not because there are none.
   */
  detailHidden: boolean;
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

/** A priority as the board names it (生命危急／緊急／一般／低); a dash for one it does not know. */
export function ticketPriorityLabel(priority: string): string {
  return adminTicketPriorityLabel(priority) ?? '—';
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

/**
 * A ticket's disaster-specific answers as the drawer lists them: one row per field, in the order
 * the fields first appear, labelled as `ticketPropertyConfigs` names them (the raw key when no
 * config is loaded for it). A multi-select arrives as one detail per chosen value; those join
 * under the one label. A number takes its config's unit.
 */
export function disasterDetailRows(
  details: readonly Pick<
    DetailTicket['disasterDetails'][number],
    'propertyName' | 'value'
  >[],
  configs: readonly DisasterFieldConfig[],
): { label: string; value: string }[] {
  const byName = new Map(
    configs.map((config) => [config.propertyName, config]),
  );
  const grouped = new Map<string, string[]>();
  for (const detail of details) {
    const values = grouped.get(detail.propertyName) ?? [];
    if (detail.value) values.push(detail.value);
    grouped.set(detail.propertyName, values);
  }
  return [...grouped].map(([name, values]) => {
    const config = byName.get(name);
    const unit =
      config?.dataType === 'number' && config.unit ? config.unit : null;
    return {
      label: config?.displayLabel || name,
      value: values.map((v) => (unit ? `${v} ${unit}` : v)).join('、'),
    };
  });
}

export function toTicketDetailView(
  ticket: DetailTicket,
  disasterLabels: Record<string, string>,
  disasterFields: readonly DisasterFieldConfig[] = [],
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
    detailHidden: coarse,
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
    disasterDetails: disasterDetailRows(ticket.disasterDetails, disasterFields),
    description: text(ticket.description),
  };
}
