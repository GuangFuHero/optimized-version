import type { GetLinkedTicketQuery } from '@rescue-frontend/data-access';

import { isLocationCellId } from '../location-cells';
import type { RescueMapGoneTicket, RescueMapMarkerItem } from '../types';
import { mapTicketToMarker } from './markers';

/**
 * What a link to a ticket no loaded page holds comes to, once the backend is asked (ADR-444):
 * - `ticket`: it is there — past the loaded pages, outside the map's view, or left out by a filter —
 *   and opens as any ticket does;
 * - `replace`: 重複審核 merged it into another ticket, whose uuid the link's `?id=` becomes, to open
 *   that one;
 * - `gone`: it was deleted, or never was, and its drawer says which;
 * - `unknown`: the request failed, or the ticket has no point to place. Neither is said to be gone:
 *   the selection lets go, as it did before there was anything to tell.
 */
export type LinkedTicket =
  | { kind: 'ticket'; marker: RescueMapMarkerItem }
  | { kind: 'replace'; uuid: string }
  | { kind: 'gone'; ticket: RescueMapGoneTicket }
  | { kind: 'unknown' };

/**
 * What to do with a selection none of the loaded markers holds:
 * - `let-go`: a station, a guest's location cell (`cell:…`), or a ticket seen loaded and gone since —
 *   left out by a filter or a pan, not deleted;
 * - `look-up`: a ticket's uuid never seen loaded, which only the backend can say is there or gone;
 * - `replace`: a link pasted with punctuation or spaces after its uuid (「…。」 in a chat), or with
 *   the uuid in upper case, whose `?id=` becomes the uuid alone in lower case — as the ticket comes
 *   back, so the two meet — then looked up as any;
 * - `gone`: a link cut short, which no answer from the backend is needed to know names no ticket.
 */
export type LinkedSelection =
  | { kind: 'let-go' }
  | { kind: 'look-up' }
  | { kind: 'replace'; uuid: string }
  | { kind: 'gone'; ticket: RescueMapGoneTicket };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRAILING_PUNCTUATION_OR_SPACE = /[\s\p{P}]+$/u;

/**
 * The ticket uuid a link's `?id=` names, as the backend writes one: punctuation or spaces after it
 * taken off and in lower case. Null for a link cut short, which names no ticket. The page's metadata
 * reads a link by the same rule (point-share's target.ts), so the tab names what the drawer opens.
 */
export function linkedTicketUuid(selectedId: string): string | null {
  const uuid = selectedId
    .replace(TRAILING_PUNCTUATION_OR_SPACE, '')
    .toLowerCase();

  return UUID_PATTERN.test(uuid) ? uuid : null;
}

export function readLinkedSelection({
  selectedId,
  dataType,
  seenLoaded,
}: {
  selectedId: string;
  dataType: string;
  seenLoaded: boolean;
}): LinkedSelection {
  if (dataType !== 'ticket' || isLocationCellId(selectedId) || seenLoaded) {
    return { kind: 'let-go' };
  }

  const uuid = linkedTicketUuid(selectedId);

  if (uuid) {
    return uuid === selectedId
      ? { kind: 'look-up' }
      : { kind: 'replace', uuid };
  }

  return {
    kind: 'gone',
    ticket: {
      id: selectedId,
      detailType: 'gone-ticket',
      availability: 'not_found',
    },
  };
}

/**
 * Reads `GetLinkedTicket`. Gone only on the backend's word: a null ticket is `deleted` or
 * `not_found` as `ticketAvailability` says, never as the loaded pages suggest; `merged` sends the
 * link on to the ticket the request now lives in, the last of a chain of merges. `available` beside
 * a null ticket — deleted or moved out of reach between the two fields — and `merged` naming no
 * ticket are told as not found, the one that claims nothing about the ticket.
 */
export function resolveLinkedTicket(
  uuid: string,
  result: { data?: GetLinkedTicketQuery; error?: unknown },
): LinkedTicket {
  if (result.error || !result.data) {
    return { kind: 'unknown' };
  }

  const { ticket, ticketAvailability } = result.data;

  if (ticket) {
    const marker = mapTicketToMarker(ticket);

    return marker ? { kind: 'ticket', marker } : { kind: 'unknown' };
  }

  const { status, replacedByUuid } = ticketAvailability;

  if (status === 'merged' && replacedByUuid) {
    return { kind: 'replace', uuid: replacedByUuid };
  }

  return {
    kind: 'gone',
    ticket: {
      id: uuid,
      detailType: 'gone-ticket',
      availability: status === 'deleted' ? 'deleted' : 'not_found',
    },
  };
}
