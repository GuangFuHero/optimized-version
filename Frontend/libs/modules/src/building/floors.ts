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

// The roof as a reporter may write it, after `normalizeFloor` (prototype `site-data.js:867-868`).
const ROOF_WORDS = /^(頂樓?|屋頂|頂樓平台|R|RF)$/;
const BELOW_PREFIX = /^(B|地下|負|-)/;
const CJK_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  '○': 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** Half-width, no spaces, upper case: '３ｆ ' and '3F' are the same floor. */
function normalizeFloor(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

/** 一 to 九十九 as a floor is written out: 三, 十二, 二十三. Null for anything else. */
function cjkNumber(text: string): number | null {
  const ten = text.indexOf('十');

  if (ten === -1) {
    let value = 0;

    for (const digit of text) {
      const n = CJK_DIGITS[digit];

      if (n === undefined) {
        return null;
      }

      value = value * 10 + n;
    }

    return value;
  }

  const tens = ten === 0 ? 1 : CJK_DIGITS[text[0]];
  const ones = ten === text.length - 1 ? 0 : CJK_DIGITS[text[ten + 1]];

  return tens === undefined || ones === undefined ? null : tens * 10 + ones;
}

/**
 * The floor a written one counts as, below ground negative (prototype `parseFloorToken`,
 * `site-data.js:802-818`): 3, 3樓 and 第三層 are 3; B1, 地下一樓 and -1 are −1. Null without one.
 */
function writtenFloorNumber(text: string): number | null {
  const below = BELOW_PREFIX.test(text);
  const rest = text.replace(BELOW_PREFIX, '').replace(/^第/, '');
  const digits = /^\d+/.exec(rest)?.[0];
  const cjk = /^[零〇○一二三四五六七八九十兩]+/.exec(rest)?.[0];
  const n = digits ? Number(digits) : cjk ? cjkNumber(cjk) : null;

  if (n === null || n <= 0) {
    return null;
  }

  return below ? -n : n;
}

/**
 * The building's floor a ticket's floor names, as a reporter wrote it (prototype `segmentOfMarker`,
 * `site-data.js:859-875`, 2026-10-25): the label itself in any width or case; the roof as 頂樓, 屋頂,
 * 頂樓平台 or R; and a floor by its number — 3樓 or 三樓 for 3F, 地下一樓 for B1. A number names only a
 * floor's own label (nF, Bn), never one of another form: 第一節車廂 is not 1F. Null when the building
 * has no such floor. The backend takes only the building's labels when a ticket is filed, but an edit
 * takes any text.
 */
export function floorLabelOf(
  written: string | null | undefined,
  labels: readonly string[],
): string | null {
  const text = normalizeFloor(written ?? '');

  if (!text) {
    return null;
  }

  const literal = labels.find((label) => normalizeFloor(label) === text);

  if (literal) {
    return literal;
  }
  if (ROOF_WORDS.test(text)) {
    return labels.includes(ROOF) ? ROOF : null;
  }

  const number = writtenFloorNumber(text);

  return number === null
    ? null
    : (labels.find((label) => label !== ROOF && floorRank(label) === number) ??
        null);
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
  const labels = [...byLabel.keys()];
  const unplaced: T[] = [];

  for (const ticket of tickets) {
    const label = floorLabelOf(floorOf(ticket), labels);
    const group = label ? byLabel.get(label) : undefined;

    if (group) {
      group.tickets.push(ticket);
    } else {
      unplaced.push(ticket);
    }
  }

  return { floors: groups, unplaced };
}
