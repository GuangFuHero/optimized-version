/**
 * A ticket's street address (`secondaryLocation`, ADR-268) in one line, for telling a volunteer
 * where they are going.
 */

/** The address parts of `SecondaryLocationType`. */
export interface TicketAddressParts {
  county?: string | null;
  city?: string | null;
  /** Holds the road (路／街) despite its name — backend `models/secondary_location.py`. */
  lane?: string | null;
  /** Holds the 巷弄. */
  alley?: string | null;
  no?: string | null;
  buildingSection?: string | null;
  /** As spoken — 'B1', '1F', 'RF' — never a number to put 樓 after. */
  floor?: string | null;
  /** '302' or '樓梯間' alike, so no 室 is added either. */
  room?: string | null;
  /**
   * A hint for finding the way in, on a ticket filed in the back office. On one filed through the
   * site's 請求協助 it is the whole address as typed, none of it split out.
   */
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

  // A Chinese street address is one continuous string (backend ADR-155) — no separators. With no
  // part of it split out, the address is the one the site's 請求協助 took as typed.
  const street =
    [location.county, location.city, location.lane, location.alley, location.no]
      .map(part)
      .join('') || part(location.landmarkNote);

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
