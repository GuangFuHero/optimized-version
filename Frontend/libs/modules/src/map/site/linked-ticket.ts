import type { GetLinkedTicketQuery } from '@rescue-frontend/data-access';

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a selection none of the loaded markers holds is worth asking the backend about. Only a
 * ticket's uuid, and only one never seen loaded: one seen and gone since was left out by a filter or
 * a pan, not deleted. A guest's location cell (`cell:…`) and a station are never looked up.
 */
export function shouldLookUpLinkedTicket({
  selectedId,
  dataType,
  seenLoaded,
}: {
  selectedId: string;
  dataType: string;
  seenLoaded: boolean;
}): boolean {
  return dataType === 'ticket' && !seenLoaded && UUID_PATTERN.test(selectedId);
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
