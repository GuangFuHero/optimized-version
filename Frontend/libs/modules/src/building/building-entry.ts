import type { BuildingMapEntry } from './use-building-maps';

/** How many buildings the list shows before 看全部 N 棟, so they do not push the tickets off the first screen. */
export const BUILDING_ENTRY_LIMIT = 3;

/**
 * The buildings at the top of the list's 任務 (prototype `SpaceEntryList`): those whose name or address
 * holds the search the tickets were searched with (`q`, none under two characters), in name order.
 * The prototype puts those still short of people first, then those with tickets; that waits for the
 * counts, which the list does not show yet.
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
    .sort((x, y) => x.name.localeCompare(y.name, 'zh-Hant'));
}
