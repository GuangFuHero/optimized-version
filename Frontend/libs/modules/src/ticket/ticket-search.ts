/** The backend's `tickets(q:)` takes 2 to 50 characters and refuses anything else. */
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 50;

export type TicketSearch =
  | { kind: 'none' }
  /** One character: the list asks for a second rather than search. */
  | { kind: 'too-short' }
  | { kind: 'query'; q: string };

/**
 * What the header's search term becomes on the ticket side: the backend's `q`, which reads the
 * tickets' text and their needs (not just the loaded pages, as filtering them did), or a request
 * for one more character. Counted in code points, as the backend counts.
 */
export function resolveTicketSearch(search: string | undefined): TicketSearch {
  const characters = [...(search?.trim() ?? '')];

  if (characters.length === 0) {
    return { kind: 'none' };
  }

  if (characters.length < SEARCH_MIN_LENGTH) {
    return { kind: 'too-short' };
  }

  // A longer term is searched on its first 50 characters, which still finds whatever it would.
  return { kind: 'query', q: characters.slice(0, SEARCH_MAX_LENGTH).join('') };
}
