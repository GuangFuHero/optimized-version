/** A back-office board whose map opens where it was left and frames its filters (MAP-VIEW-104). */
export type ShownFiltersBoard = 'station-management' | 'ticket-board';

const storageKey = (board: ShownFiltersBoard) => `${board}:shown-filters`;

// Reads and writes below fail quietly, as the map's remembered view does (map-opening.ts): the
// filters then count as new, and a map that could remember nothing frames them anyway.

/**
 * The filters the board's map last framed or left alone, as one string. The map writes them, not the
 * page: the page can be built twice as it opens, and would count its own.
 */
export function readShownFilters(board: ShownFiltersBoard): string | null {
  try {
    return window.localStorage.getItem(storageKey(board));
  } catch {
    return null;
  }
}

export function rememberShownFilters(
  board: ShownFiltersBoard,
  filtersKey: string,
) {
  try {
    window.localStorage.setItem(storageKey(board), filtersKey);
  } catch {
    // Nothing remembered; see above.
  }
}
