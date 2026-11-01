import type { BuildingMapEntry } from './use-building-maps';

/** How many buildings the list shows before 看全部 N 棟, so they do not push the tickets off the first screen. */
export const BUILDING_ENTRY_LIMIT = 3;

/**
 * The buildings at the top of the list's 任務 (prototype `SpaceEntryList`): those whose name or address
 * holds the search the tickets were searched with (`q`, none under two characters). Those still short
 * of the most people first, then those with the most tickets, then those nobody has asked for help in
 * yet (SPACE-FE-103); in name order among equals. A guest is given no counts, so a guest's are in name
 * order alone.
 */
export function buildingEntries(
  buildings: readonly BuildingMapEntry[],
  q: string | undefined,
): BuildingMapEntry[] {
  const term = q?.trim().toLowerCase();

  return buildings
    .filter(
      (building) =>
        !term ||
        [building.name, building.address].some((text) =>
          text?.toLowerCase().includes(term),
        ),
    )
    .sort(
      (x, y) =>
        (y.shortfall ?? 0) - (x.shortfall ?? 0) ||
        (y.ticketCount ?? 0) - (x.ticketCount ?? 0) ||
        x.name.localeCompare(y.name, 'zh-Hant'),
    );
}
