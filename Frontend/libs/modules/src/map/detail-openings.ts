/**
 * Whether a point's detail is open, and how many times it has been opened. Closed, the desktop
 * panel keeps its content — only the phone's drawer lets go of it, once shut — so the map and the
 * list key that panel by the count: a ticket opened there again gets a new panel, and a new panel
 * reads the ticket again (WG-028).
 */
export interface DetailOpenings {
  open: boolean;
  openings: number;
}

/**
 * A `useReducer` reducer taking whether the detail is now open. Open while already open — another
 * point picked, or the same one come back read again after a claim — is not an opening: the panel
 * stays, and whatever is under way in it.
 */
export function countDetailOpenings(
  current: DetailOpenings,
  open: boolean,
): DetailOpenings {
  if (current.open === open) {
    return current;
  }

  return { open, openings: open ? current.openings + 1 : current.openings };
}
