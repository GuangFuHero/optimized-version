/**
 * A ticket's address (`secondaryLocation`) in one line, for telling a volunteer where they are going.
 */

/** The address fields of `SecondaryLocationType` this file reads. */
export interface TicketAddressParts {
  /** The whole street address, split and checked by the backend; official when TGOS confirmed it. */
  fullAddress?: string | null;
  buildingSection?: string | null;
  /** As spoken — 'B1', '1F', 'RF' — never a number to put 樓 after. */
  floor?: string | null;
  /** '302' or '樓梯間' alike, so no 室 is added either. */
  room?: string | null;
  /** A hint for finding the way in; the whole typed address on a 請求協助 from before `fullAddress`. */
  landmarkNote?: string | null;
}

const part = (value?: string | null) => value?.trim() ?? '';

/** The street address alone, or null when there is none. */
export function formatTicketStreet(
  location: TicketAddressParts | null | undefined,
): string | null {
  if (!location) {
    return null;
  }

  // A 請求協助 filed before the site sent `fullAddress` has its address as the landmark note.
  const street = part(location.fullAddress) || part(location.landmarkNote);

  return street || null;
}

/** The building, floor and room, spaced, or null when none was given. */
export function formatTicketUnit(
  location: TicketAddressParts | null | undefined,
): string | null {
  if (!location) {
    return null;
  }

  const unit = [location.buildingSection, location.floor, location.room]
    .map(part)
    .filter(Boolean)
    .join(' ');

  return unit || null;
}

/**
 * Null when there is nothing to show: `secondaryLocation` is null for a ticket filed without an
 * address, and for a caller without ticket.view_detail on it.
 */
export function formatTicketAddress(location: TicketAddressParts | null | undefined): string | null {
  const line = [formatTicketStreet(location), formatTicketUnit(location)]
    .filter(Boolean)
    .join(' ');

  return line || null;
}
