import type { BuildingMapEntry } from './use-building-maps';

/** How many buildings the list shows before 看全部 N 棟, so they do not push the tickets off the first screen. */
export const BUILDING_ENTRY_LIMIT = 3;

/**
 * The buildings at the top of the list's 任務 (prototype `SpaceEntryList`): those whose name or address
 * holds the search the tickets were searched with (`q`, none under two characters). Those still short
 * of the most people first, then those with tickets, then those nobody has asked for help in yet
 * (SPACE-FE-103); in name order among equals. How many tickets does not order them: the count holds
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
        (y.shortfall ?? 0) - (x.shortfall ?? 0) ||
        Number((y.ticketCount ?? 0) > 0) - Number((x.ticketCount ?? 0) > 0) ||
        x.name.localeCompare(y.name, 'zh-Hant'),
    );
}

/**
 * What a building's row says on its right, as its map entry does: its tickets, closed ones too
 * (ADR-450), and the red 「缺 M」 when they are still short of people. 0 tickets is 還沒有求助; a
 * guest, given no counts (SPACE-FE-104), gets 看各樓層 and no 缺.
 */
export function buildingEntryWords(
  building: Pick<BuildingMapEntry, 'ticketCount' | 'shortfall'>,
): { count: string; short: string | null } {
  const { ticketCount, shortfall } = building;

  return {
    count:
      ticketCount === null
        ? '看各樓層'
        : ticketCount === 0
          ? '還沒有求助'
          : `${ticketCount} 件`,
    short: shortfall && shortfall > 0 ? `缺 ${shortfall}` : null,
  };
}
