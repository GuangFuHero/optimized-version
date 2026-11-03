import type { BuildingMapEntry } from './use-building-maps';

/** How many buildings the list shows before 看全部 N 棟, so they do not push the tickets off the first screen. */
export const BUILDING_ENTRY_LIMIT = 3;

/**
 * The buildings at the top of the list's 任務 (prototype `SpaceEntryList`): those whose name or address
 * holds the search the tickets were searched with (`q`, none under two characters). As the tickets
 * below are ordered (`ticketRank`): those still short first, then those with tickets, then those
 * nobody has asked for help in yet; in name order among equals. Whether short, not by how much: the
 * shortfall adds people and supplies together (3 people and 50 lunch boxes are 「缺 53」). How many tickets does not order them: the count holds
 * closed ones too (ADR-450), and a building whose tickets are all done would go above one still being
 * helped. A guest is given no counts, so a guest's are in name order alone.
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
        Number((y.shortfall ?? 0) > 0) - Number((x.shortfall ?? 0) > 0) ||
        Number((y.ticketCount ?? 0) > 0) - Number((x.ticketCount ?? 0) > 0) ||
        x.name.localeCompare(y.name, 'zh-Hant'),
    );
}

/**
 * What a building's row says on its right, as its map entry does: its tickets, closed ones too
 * (ADR-450), and no 「缺 M」 (see `buildingEntries`); which floor is short is in the drawer, as
 * 「N 件缺人」. 0 tickets is 還沒有求助; a guest, given no counts (SPACE-FE-104), gets 看各樓層.
 */
export function buildingEntryCount(
  building: Pick<BuildingMapEntry, 'ticketCount'>,
): string {
  const { ticketCount } = building;

  return ticketCount === null
    ? '看各樓層'
    : ticketCount === 0
      ? '還沒有求助'
      : `${ticketCount} 件`;
}
