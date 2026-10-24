/**
 * A building's floors as its drawer lists them (prototype `site-building.jsx`, 現場分區): one box per
 * floor, and the tickets filed on each.
 *
 * The backend gives fixed labels — 'RF', 'nF' down to '1F', 'B1' and down (`services/building_map.py`)
 * — roof first, in the building's own order. The drawer turns them around as the prototype has it
 * (`wg-bridge.js` `buildingFloors`, 2026-09-12): 1F at the top and up from there, the basements above
 * 1F, B2 above B1 — smallest number first, as the reference site and any table read. The prototype has
 * no roof; it goes last, as 頂樓. Both asked of the designer (uiux, 2026-10-24).
 */

/** A floor as `buildingMap.floors` returns it. */
export interface BuildingFloor {
  label: string;
  /** The areas a ticket on it picks from, ending with 其他; empty where the room is typed instead. */
  areas: readonly string[];
}

const ABOVE_GROUND = /^(\d+)F$/;
const BELOW_GROUND = /^B(\d+)$/;
const ROOF = 'RF';

/** Where a label goes, smallest first: B2 −2, B1 −1, 1F 1, 2F 2…, the roof last; null if unknown. */
function floorRank(label: string): number | null {
  if (label === ROOF) {
    return Number.POSITIVE_INFINITY;
  }

  const above = ABOVE_GROUND.exec(label);

  if (above) {
    return Number(above[1]);
  }

  const below = BELOW_GROUND.exec(label);

  return below ? -Number(below[1]) : null;
}

/**
 * The floors top to bottom as the drawer shows them. A label of no known form — the backend has none
 * yet — goes last, in the backend's order, rather than being dropped: tickets may be filed on it.
 */
export function orderFloors<T extends Pick<BuildingFloor, 'label'>>(
  floors: readonly T[],
): T[] {
  const known = floors.filter((floor) => floorRank(floor.label) !== null);
  const unknown = floors.filter((floor) => floorRank(floor.label) === null);

  return [
    ...known.sort(
      (a, b) => (floorRank(a.label) ?? 0) - (floorRank(b.label) ?? 0),
    ),
    ...unknown,
  ];
}

/** The name a floor's box carries: its label, the roof's spelled out. */
export function floorName(label: string): string {
  return label === ROOF ? '頂樓' : label;
}

export interface FloorGroup<T> {
  floor: BuildingFloor;
  tickets: T[];
}

export interface FloorGroups<T> {
  /** Every floor, an empty one too — that it holds no ticket is something to say. */
  floors: FloorGroup<T>[];
  /**
   * Tickets on no floor of the building: filed without one (a neighbour who could not say which),
   * or on a floor taken off the building since. Never hidden (prototype 未定位).
   */
  unplaced: T[];
}

/** The tickets put on their floors, the floors in the drawer's order. */
export function groupByFloor<T>(
  floors: readonly BuildingFloor[],
  tickets: readonly T[],
  floorOf: (ticket: T) => string | null | undefined,
): FloorGroups<T> {
  const groups = orderFloors(floors).map((floor) => ({
    floor,
    tickets: [] as T[],
  }));
  const byLabel = new Map(groups.map((group) => [group.floor.label, group]));
  const unplaced: T[] = [];

  for (const ticket of tickets) {
    const label = floorOf(ticket)?.trim();
    const group = label ? byLabel.get(label) : undefined;

    if (group) {
      group.tickets.push(ticket);
    } else {
      unplaced.push(ticket);
    }
  }

  return { floors: groups, unplaced };
}
