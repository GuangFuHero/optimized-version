import type { GetLinkedTicketQuery } from '@rescue-frontend/data-access';

import { isLocationCellId } from '../location-cells';
import type { RescueMapGoneTicket, RescueMapMarkerItem } from '../types';
import { mapTicketToMarker } from './markers';

/**
 * What a link to a ticket no loaded page holds comes to, once the backend is asked (ADR-444):
 * - `ticket`: it is there — past the loaded pages, outside the map's view, or left out by a filter —
 *   and opens as any ticket does;
 * - `gone`: it was deleted, or never was, and its drawer says which;
 * - `unknown`: the request failed, or the ticket has no point to place. Neither is said to be gone:
 *   the selection lets go, as it did before there was anything to tell.
 */
export type LinkedTicket =
  | { kind: 'ticket'; marker: RescueMapMarkerItem }
  | { kind: 'gone'; ticket: RescueMapGoneTicket }
  | { kind: 'unknown' };

/**
 * What to do with a selection none of the loaded markers holds:
 * - `let-go`: a station, a guest's location cell (`cell:…`), or a ticket seen loaded and gone since —
 *   left out by a filter or a pan, not deleted;
 * - `look-up`: a ticket's uuid never seen loaded, which only the backend can say is there or gone;
 * - `replace`: a link pasted with punctuation or spaces after its uuid (「…。」 in a chat), whose
 *   `?id=` becomes the uuid alone, then looked up as any;
 * - `gone`: a link cut short, which no answer from the backend is needed to know names no ticket.
 */
export type LinkedSelection =
  | { kind: 'let-go' }
  | { kind: 'look-up' }
  | { kind: 'replace'; uuid: string }
  | { kind: 'gone'; ticket: RescueMapGoneTicket };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRAILING_PUNCTUATION_OR_SPACE = /[\s\p{P}]+$/u;

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

  if (UUID_PATTERN.test(selectedId)) {
    return { kind: 'look-up' };
  }

  const trimmed = selectedId.replace(TRAILING_PUNCTUATION_OR_SPACE, '');

  if (UUID_PATTERN.test(trimmed)) {
    return { kind: 'replace', uuid: trimmed };
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
 * `not_found` as `ticketAvailability` says, never as the loaded pages suggest. `available` beside a
 * null ticket — deleted or moved out of reach between the two fields — is told as not found, the one
 * that claims nothing about the ticket.
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

  return {
    kind: 'gone',
    ticket: {
      id: uuid,
      detailType: 'gone-ticket',
      availability: ticketAvailability === 'deleted' ? 'deleted' : 'not_found',
    },
  };
}
