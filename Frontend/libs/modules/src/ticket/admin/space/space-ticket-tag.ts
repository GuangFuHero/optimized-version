/**
 * The tag a ticket filed in a space carries beside its title on the 任務管理 list: 「🏢 名稱 · 3F」
 * (designer, `Design/後台/docs/任務管理.md` §開啟空間 3). Deleting the space clears the ticket's
 * `buildingMapUuid`, so the tag goes with it.
 */

import { matchFloor } from './floors';

export interface TaggedSpace {
  name: string;
  floorLabels: readonly string[];
}

/**
 * Null outside a space, and in a space not loaded (outside the map's bounds, say): no tag beats a
 * wrong one. A floor the building no longer has shows as written.
 */
export function spaceTicketTag(
  ticket: {
    buildingMapUuid?: string | null;
    secondaryLocation?: { floor?: string | null } | null;
  },
  spaces: ReadonlyMap<string, TaggedSpace>,
): string | null {
  const space = ticket.buildingMapUuid
    ? spaces.get(ticket.buildingMapUuid)
    : undefined;
  if (!space) return null;
  const { floor, raw } = matchFloor(
    ticket.secondaryLocation?.floor,
    space.floorLabels,
  );
  const shown = floor ?? raw;
  return shown ? `🏢 ${space.name} · ${shown}` : `🏢 ${space.name}`;
}
