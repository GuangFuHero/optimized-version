/**
 * 我的任務 › 我承接的: the needs a volunteer said they would go to, read for the day they go —
 * where, whom to call, and which need (prototype `MyTasksDrawer`, `site-actions.jsx:1765-1896`).
 */

import { SITE_FALLBACK_DATA_TYPE } from '../../route/constants';
import { createSiteHref } from '../../route/serialize';
import type { SiteModule, SiteRouteState } from '../../route/types';
import { formatTicketAddress, type TicketAddressParts } from '../address';

/** One row of `myTaskAssignments`, as `MyTaskAssignments` in `tickets.graphql` reads it. */
export interface MyTaskAssignmentRow {
  assignment: { uuid: string; assignedAt?: string | null };
  task: { uuid: string; taskName: string; recruitingStoppedAt?: string | null };
  ticket: {
    uuid: string;
    title: string;
    contactName?: string | null;
    contactPhone?: string | null;
    secondaryLocation?: TicketAddressParts | null;
  };
}

/** A claimed need as the list shows it. */
export interface MyClaim {
  assignmentUuid: string;
  ticketUuid: string;
  ticketTitle: string;
  needName: string;
  /** 「承接於 9/30 14:05」, or null for a claim with no time on it. */
  claimedAt: string | null;
  address: string | null;
  contact: string | null;
  /**
   * Its requester stopped recruiting by hand: the list is final, and no place on it can be given
   * back (Q46). One that filled by itself can, and then recruits again (Q40).
   */
  recruitingStopped: boolean;
}

// Numbers only: `en-US` spells each part as digits, where `zh-TW` would add 上午／下午.
const CLAIMED_AT_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * When the need was claimed, in Taiwan time whatever the device's zone, without the year: the
 * list is of claims still to be kept (spec Q50).
 */
export function formatClaimedAt(iso: string | null | undefined): string | null {
  const time = iso ? new Date(iso) : null;

  if (!time || Number.isNaN(time.getTime())) {
    return null;
  }

  const parts = Object.fromEntries(
    CLAIMED_AT_FORMAT.formatToParts(time).map((part) => [
      part.type,
      part.value,
    ]),
  );

  return `承接於 ${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** Name and number as the claim confirmation joins them (`need-claim-dialog.tsx`). */
function formatContact(
  name?: string | null,
  phone?: string | null,
): string | null {
  return [name?.trim(), phone?.trim()].filter(Boolean).join(' · ') || null;
}

/** In the order the server sends them — newest claim first (spec Q16). */
export function readMyClaims(rows: readonly MyTaskAssignmentRow[]): MyClaim[] {
  return rows.map(({ assignment, task, ticket }) => ({
    assignmentUuid: assignment.uuid,
    ticketUuid: ticket.uuid,
    ticketTitle: ticket.title,
    needName: task.taskName,
    claimedAt: formatClaimedAt(assignment.assignedAt),
    address: formatTicketAddress(ticket.secondaryLocation),
    contact: formatContact(ticket.contactName, ticket.contactPhone),
    recruitingStopped: task.recruitingStoppedAt != null,
  }));
}

/**
 * Where 查看 takes the volunteer: the ticket on the list, whose drawer opens even when the ticket
 * is past the pages loaded (F3a). The map would first have to find it in its view.
 */
export function myClaimTicketHref(ticketUuid: string): string {
  return createSiteHref('list', {
    dataType: 'ticket',
    selectedMarkerId: ticketUuid,
  });
}

/** Select the ticket where the volunteer is, or go to it. */
export type ClaimedTicketOpening =
  | { select: SiteRouteState }
  | { href: string };

/**
 * How 查看 opens the ticket. On the ticket list already, it is selected in place, as a click on its
 * card selects it, with the list's filters kept: the site's route state rereads the address only
 * when its path changes (`SiteRouteProvider`), so a link differing only in `?id=` would leave the
 * drawer shut. From anywhere else it goes to `myClaimTicketHref`.
 */
export function openClaimedTicket(
  current: { module: SiteModule; state: SiteRouteState },
  ticketUuid: string,
): ClaimedTicketOpening {
  const onTicketList =
    current.module === 'list' &&
    (current.state.dataType ?? SITE_FALLBACK_DATA_TYPE) === 'ticket';

  return onTicketList
    ? { select: { ...current.state, selectedMarkerId: ticketUuid } }
    : { href: myClaimTicketHref(ticketUuid) };
}
