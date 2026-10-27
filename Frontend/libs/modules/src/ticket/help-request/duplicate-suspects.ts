/**
 * What the backend's duplicate check held back, read for the dialog that asks whether it is the
 * same thing (`duplicate-warn-dialog.tsx`, prototype `DuplicateWarnDialog`, `site-actions.jsx`).
 * Held means nothing was written. 再加一件 sends one need and 請求協助 several; each need that looks
 * like an open need of another ticket is named by its place in what was sent, `task:0`, `task:1`…
 */

import type { SiteModule, SiteRouteState } from '../../route/types';
import { distanceM, type LatLng } from '../address-lookup';
import {
  openClaimedTicket,
  type ClaimedTicketOpening,
} from '../my-claims/my-claims';

/** Near enough to see the street, as a ticket just filed is shown (`help-request-host.tsx`). */
const TICKET_ZOOM = 16;

/** One suspect, as the mutations in `tickets.graphql` read it. */
export interface DuplicateSuspect {
  /** Which need of what was sent: `task:0`, `task:1`… */
  draftRef?: string;
  /** The open need of another ticket it looks like. */
  relatedUuid: string;
  /** That need's ticket. */
  relatedTicketUuid?: string | null;
}

/** Another ticket with open needs what is being sent looks like. */
export interface SuspectTicket {
  ticketUuid: string;
  /** Which of its needs. */
  needUuids: string[];
  /** Which of the needs being sent look like them, by name. */
  alike?: string[];
}

const SENT_NEED = /^task:(\d+)$/;

/** The place among the needs sent that a `draftRef` names; null for one that names no need. */
export function sentNeedIndex(draftRef: string | undefined): number | null {
  const match = draftRef ? SENT_NEED.exec(draftRef) : null;

  return match ? Number(match[1]) : null;
}

/**
 * One entry per ticket, in the order the backend ranked them; a suspect with no ticket to show is
 * left out. `nameOf` names the need sent that a suspect is for, where there are several.
 */
export function groupSuspectsByTicket(
  suspects: readonly DuplicateSuspect[],
  nameOf?: (suspect: DuplicateSuspect) => string | null,
): SuspectTicket[] {
  const tickets: SuspectTicket[] = [];

  for (const suspect of suspects) {
    const { relatedUuid, relatedTicketUuid } = suspect;

    if (!relatedTicketUuid) {
      continue;
    }

    let ticket = tickets.find((item) => item.ticketUuid === relatedTicketUuid);

    if (!ticket) {
      ticket = { ticketUuid: relatedTicketUuid, needUuids: [] };
      tickets.push(ticket);
    }

    ticket.needUuids.push(relatedUuid);

    const name = nameOf?.(suspect);

    if (name && !ticket.alike?.includes(name)) {
      ticket.alike = [...(ticket.alike ?? []), name];
    }
  }

  return tickets;
}

/** 請求協助 held: the tickets to show, and what 確認不重複，送出 sends. */
export interface HeldHelpRequest {
  tickets: SuspectTicket[];
  /**
   * For each need held, by its place among the needs sent, the suspect the backend named for it.
   * Sent back as that need's `acknowledgedDuplicateOf`, the need is not held again while the
   * backend still finds that one; held for another, it takes that one instead (ADR-400). Every need
   * held is named, one with no ticket to show included, or the request would be held again for it.
   */
  acknowledge: Record<number, string>;
}

/**
 * `sentNames`: the needs' names as sent, in order (`toHelpRequestInput`'s `tasks`). `acknowledged`:
 * what was sent with them, when held again after 確認不重複，送出. Those needs are kept acknowledged,
 * or the next try would be held for them once more, needs taking turns for as long as one is held.
 */
export function readHeldHelpRequest(
  suspects: readonly DuplicateSuspect[],
  sentNames: readonly string[],
  acknowledged: Readonly<Record<number, string>> = {},
): HeldHelpRequest {
  const acknowledge: Record<number, string> = { ...acknowledged };
  const named = new Set<number>();

  for (const suspect of suspects) {
    const index = sentNeedIndex(suspect.draftRef);

    if (index !== null && !named.has(index)) {
      named.add(index);
      acknowledge[index] = suspect.relatedUuid;
    }
  }

  return {
    tickets: groupSuspectsByTicket(suspects, (suspect) => {
      const index = sentNeedIndex(suspect.draftRef);

      return index === null ? null : (sentNames[index] ?? null);
    }),
    acknowledge,
  };
}

/** A ticket's place, as `TicketFields` gives it. */
interface TicketPlace {
  geometry?: unknown;
  /** Set when `geometry` is only the centre of a cell (ADR-281). */
  locationCell?: string | null;
}

function readPoint(geometry: unknown): LatLng | null {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }

  const { type, coordinates } = geometry as {
    type?: unknown;
    coordinates?: unknown;
  };

  if (
    type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length !== 2
  ) {
    return null;
  }

  const [lng, lat] = coordinates;

  return typeof lat === 'number' && typeof lng === 'number'
    ? { lat, lng }
    : null;
}

/**
 * How far a ticket is from the point being sent, in whole metres: the reason a person can check at
 * a glance (prototype 「相距 12 公尺」). The backend gives no distance. Null without a point, or
 * when the ticket's is only a cell centre, which could be hundreds of metres off.
 */
export function distanceToTicketM(
  from: LatLng | null,
  ticket: TicketPlace | null,
): number | null {
  if (!from || !ticket || ticket.locationCell) {
    return null;
  }

  const point = readPoint(ticket.geometry);

  return point ? Math.round(distanceM(from, point)) : null;
}

/** Where a ticket is, to centre the map on: for one shown only as its cell, the cell's centre. */
export function ticketPoint(ticket: TicketPlace | null): LatLng | null {
  return ticket ? readPoint(ticket.geometry) : null;
}

/** How a ticket it looks like opens: selected on the map or the list, or gone to. */
export type SuspectTicketOpening =
  | ClaimedTicketOpening
  | { onMap: SiteRouteState };

/**
 * On the map the person stays there, and the ticket is selected on tickets with no filter that
 * could hide it, centred on `point` — as a ticket just filed is shown. Going to the list would
 * remount the page, and with it the toast saying what was typed was not sent. Anywhere else, as 查看
 * opens a claimed ticket. `map`: the map's route state and zoom, null off the map. Without a
 * `point` the view stays where it is.
 */
export function openSuspectTicket(
  current: { module: SiteModule; state: SiteRouteState },
  map: { state: SiteRouteState; zoom: number } | null,
  ticketUuid: string,
  point: LatLng | null,
): SuspectTicketOpening {
  if (!map) {
    return openClaimedTicket(current, ticketUuid);
  }

  const onTickets: SiteRouteState = {
    ...map.state,
    dataType: 'ticket',
    subDataTypes: undefined,
    search: undefined,
    selectedMarkerId: ticketUuid,
  };

  return {
    onMap: point
      ? {
          ...onTickets,
          position: {
            center: [point.lat, point.lng],
            zoom: Math.max(map.zoom, TICKET_ZOOM),
          },
        }
      : onTickets,
  };
}
