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
   * site's 請求協助 it is the whole address as typed, none of it split out (help-request spec Q7).
   */
  landmarkNote?: string | null;
}

/**
 * Null when there is nothing to show: `secondaryLocation` is null for a ticket filed without an
 * address, and for a caller without ticket.view_detail on it.
 */
export function formatTicketAddress(location: TicketAddressParts | null | undefined): string | null {
  if (!location) {
    return null;
  }

  const part = (value?: string | null) => value?.trim() ?? '';
  // A Chinese street address is one continuous string (backend ADR-155) — no separators. With no
  // part of it split out, the address is the one the site's 請求協助 took as typed (spec D4).
  const street =
    [location.county, location.city, location.lane, location.alley, location.no]
      .map(part)
      .join('') || part(location.landmarkNote);
  const line = [street, part(location.buildingSection), part(location.floor), part(location.room)]
    .filter(Boolean)
    .join(' ');

  return line || null;
}
