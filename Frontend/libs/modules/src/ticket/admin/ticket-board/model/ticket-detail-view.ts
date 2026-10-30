import type {
  AdminTicketPropertyConfigsQuery,
  AdminTicketQuery,
} from '@rescue-frontend/data-access/admin';

import { taiwanDateParts } from '../../../../time';
import { formatTicketStreet, formatTicketUnit } from '../../../address';
import { formatTicketStatusLabel } from '../../../status';
import { adminTicketPriorityLabel } from './ticket-priority';
import {
  suspectedDuplicateOf,
  UNTITLED_TICKET,
  type AwaitedVerification,
} from './ticket-row';

export type DetailTicket = NonNullable<AdminTicketQuery['ticket']> &
  AwaitedVerification;

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
  /**
   * The tickets it may repeat (`suspectedDuplicateOf`): 查核中 · 疑似重複 at the top and 查核狀態
   * under 系統資訊; null when it is not a suspected duplicate.
   */
  suspectedDuplicateOf: string[] | null;
  /** As the API returned it; the sheet formats it for display. */
  updatedAt: string | null;
  /** The subtitle, 「建立於 06/13 09:12」 in Taiwan time; null without a creation time. */
  createdLabel: string | null;
  /**
   * 指派 Team: the 責任區 teams' names (`responsibleTeams`), empty when none; null when withheld
   * (a coarse ticket), which is not the same as none.
   */
  teamNames: string[] | null;
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
  /** 現場災況: every configured field, a null value for one left empty (未填). */
  disasterDetails: { label: string; value: string | null }[];
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

/**
 * 現場災況 as the drawer lists it: every field configured for the ticket's disaster types, in their
 * configured order, with a null value for one left empty (未填, TM-FS-110); then any answer to a
 * field no loaded config names (a retired one), labelled by its key, so a value given is never
 * dropped (TM-FS-109).
 */
export function disasterFieldRows(
  details: readonly Pick<
    DetailTicket['disasterDetails'][number],
    'propertyName' | 'value'
  >[],
  configs: readonly DisasterFieldConfig[],
): { label: string; value: string | null }[] {
  const named = new Set(configs.map((config) => config.propertyName));
  // Labelled and joined as disasterDetailRows does, keyed by field: one per field answered.
  const answers = new Map(
    [...new Set(details.map((detail) => detail.propertyName))].map((name) => [
      name,
      disasterDetailRows(
        details.filter((detail) => detail.propertyName === name),
        configs,
      )[0],
    ]),
  );
  return [
    ...configs.map((config) => ({
      label: config.displayLabel || config.propertyName,
      value: answers.get(config.propertyName)?.value || null,
    })),
    ...[...answers]
      .filter(([name]) => !named.has(name))
      .map(([, row]) => ({ label: row.label, value: row.value || null })),
  ];
}

/** 「建立於 06/13 09:12」, Taiwan time. */
function createdLabel(iso: string | null | undefined): string | null {
  const time = iso ? new Date(iso) : null;
  if (!time || Number.isNaN(time.getTime())) return null;
  const p = taiwanDateParts(time);
  return `建立於 ${p.month}/${p.day} ${p.hour}:${p.minute}`;
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
    suspectedDuplicateOf: suspectedDuplicateOf(ticket.verificationStatus),
    updatedAt: ticket.updatedAt ?? null,
    createdLabel: createdLabel(ticket.createdAt),
    teamNames: coarse ? null : ticket.responsibleTeams.map((team) => team.name),
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
    disasterDetails: disasterFieldRows(ticket.disasterDetails, disasterFields),
    description: text(ticket.description),
  };
}
