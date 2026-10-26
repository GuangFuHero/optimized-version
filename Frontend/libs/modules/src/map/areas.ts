import type { RescueMapArea, RescueMapPublicZone } from './types';

/** What each kind of area is called (prototype back office `ZONE_KINDS`, `map-data.js:108-112`). */
export const AREA_KIND_LABELS = {
  hazardous_zone: '危險區',
  team_zone: '責任區',
  mark_zone: '標示區',
} as const;

export type RescueMapAreaKind = keyof typeof AREA_KIND_LABELS;

export function isAreaKind(value: string): value is RescueMapAreaKind {
  return Object.prototype.hasOwnProperty.call(AREA_KIND_LABELS, value);
}

/** A 危險區 on the 封閉區域 layer carries no kind of its own. */
export function areaKind(
  area: RescueMapArea | RescueMapPublicZone,
): RescueMapAreaKind {
  return 'kind' in area ? area.kind : 'hazardous_zone';
}

/**
 * 「責任區・大平村」: its kind and name (prototype `site-map.jsx`, ZONE-STYLE-102), so a phone, which
 * has no hover, tells the kinds apart. An area without a name is its kind alone.
 */
export function areaTitle(area: RescueMapArea | RescueMapPublicZone): string {
  const kind = AREA_KIND_LABELS[areaKind(area)];
  const name = area.name?.trim();

  return name ? `${kind}・${name}` : kind;
}

/**
 * The most of a name a label writes (prototype ZONE-NAME-101): the back office takes no more, and
 * older names are cut. Counted in characters as a person reads them, so a rare character such as
 * 𥕢 is one, not the two of a string's `length`.
 */
export const AREA_LABEL_NAME_MAX = 10;

/**
 * What the label on the map writes: `areaTitle`, with a name over 10 characters cut to its first 9
 * and 「…」. The popup still tells the whole name.
 */
export function areaLabelText(
  area: RescueMapArea | RescueMapPublicZone,
): string {
  const kind = AREA_KIND_LABELS[areaKind(area)];
  const characters = [...(area.name?.trim() ?? '')];

  if (characters.length === 0) {
    return kind;
  }

  const name =
    characters.length > AREA_LABEL_NAME_MAX
      ? `${characters.slice(0, AREA_LABEL_NAME_MAX - 1).join('')}…`
      : characters.join('');

  return `${kind}・${name}`;
}

/**
 * What tapping an area's label tells (prototype ZONE-CLICK-101): its title, the teams of a 責任區,
 * and its note. One per line, as a note can run long.
 */
export function areaPopupLines(
  area: RescueMapArea | RescueMapPublicZone,
): string[] {
  const teams =
    'teams' in area && area.teams.length > 0
      ? `負責：${area.teams.join('、')}`
      : null;

  return [areaTitle(area), teams, area.comment?.trim()].filter(
    (line): line is string => Boolean(line),
  );
}

/**
 * Whether a tap on the label opens the popup: when it tells more than the label, the teams, a note,
 * or a name the label cut short.
 */
export function areaLabelOpensPopup(
  area: RescueMapArea | RescueMapPublicZone,
): boolean {
  return (
    areaPopupLines(area).length > 1 || areaLabelText(area) !== areaTitle(area)
  );
}

interface PixelSize {
  width: number;
  height: number;
}

/** A box on the map's screen, in pixels from its top left corner. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AreaLabelRequest {
  hazard: boolean;
  /** The box around the area, though it reach off the screen. */
  area: ScreenBox;
  label: PixelSize;
}

/** Where a label's middle goes: inside its area, or beside it. */
export interface PlacedAreaLabel {
  place: 'center' | 'below' | 'above' | 'right';
  x: number;
  y: number;
}

/** A label's place, or that it is left out this time: no place was clear, or its area is off screen. */
export type AreaLabelSpot = PlacedAreaLabel | { place: 'hidden' | 'offscreen' };

export interface AreaLabelScreen extends PixelSize {
  /** Cell counts and pins, which stay where they are: a label keeps clear of them. */
  obstacles: readonly ScreenBox[];
  /** Whether something floats over this part of the map, a button or a card. */
  isCovered: (label: ScreenBox) => boolean;
}

// How near a label comes to what it keeps clear of, and to an area it hangs beside.
const LABEL_PADDING = 3;
const LABEL_GAP = 4;
// The room a label needs inside an area, all round, to be tried there.
const LABEL_INSET = 8;
const LABEL_GRID_STEPS = 4;

function boxesOverlap(a: ScreenBox, b: ScreenBox): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

function padBox(box: ScreenBox, by: number): ScreenBox {
  return {
    left: box.left - by,
    top: box.top - by,
    right: box.right + by,
    bottom: box.bottom + by,
  };
}

/**
 * Where each area's label goes (prototype ZONE-LABEL-102, `site-map.jsx` `placeLabels`), in the
 * order of `requests`. Cell counts and pins come first and stay put; no label covers them, another
 * label, a button floating over the map, or the edge of the screen.
 *
 * 危險區 choose first, the others by their size on screen, smallest first, as a small area has few
 * places to choose from. Each label takes the first clear place of: inside the part of its area on
 * screen, when it has room, at 5×5 points nearest the middle first; then below the area, above it,
 * and to its right. With none clear, the label is left out and the area drawn alone: its stripes
 * still say 危險.
 */
export function placeAreaLabels(
  requests: readonly AreaLabelRequest[],
  screen: AreaLabelScreen,
): AreaLabelSpot[] {
  const taken = screen.obstacles.map((box) => padBox(box, LABEL_PADDING));
  const spots: AreaLabelSpot[] = requests.map(() => ({ place: 'offscreen' }));
  const size = ({ area }: AreaLabelRequest) =>
    Math.abs((area.right - area.left) * (area.bottom - area.top));
  const order = requests
    .map((request, index) => ({ request, index }))
    .sort(
      (a, b) =>
        Number(b.request.hazard) - Number(a.request.hazard) ||
        size(a.request) - size(b.request),
    );

  order.forEach(({ request: { area, label }, index }) => {
    const left = Math.max(area.left, 0);
    const top = Math.max(area.top, 0);
    const right = Math.min(area.right, screen.width);
    const bottom = Math.min(area.bottom, screen.height);

    if (right <= left || bottom <= top) {
      return;
    }

    const middleX = (left + right) / 2;
    const middleY = (top + bottom) / 2;
    const candidates: PlacedAreaLabel[] = [];

    if (
      right - left >= label.width + LABEL_INSET * 2 &&
      bottom - top >= label.height + LABEL_INSET * 2
    ) {
      const x0 = left + LABEL_INSET + label.width / 2;
      const x1 = right - LABEL_INSET - label.width / 2;
      const y0 = top + LABEL_INSET + label.height / 2;
      const y1 = bottom - LABEL_INSET - label.height / 2;
      const inside: [number, number][] = [];

      for (let i = 0; i <= LABEL_GRID_STEPS; i++) {
        for (let j = 0; j <= LABEL_GRID_STEPS; j++) {
          inside.push([
            x0 + ((x1 - x0) * i) / LABEL_GRID_STEPS,
            y0 + ((y1 - y0) * j) / LABEL_GRID_STEPS,
          ]);
        }
      }

      inside
        .sort(
          ([ax, ay], [bx, by]) =>
            Math.hypot(ax - middleX, ay - middleY) -
            Math.hypot(bx - middleX, by - middleY),
        )
        .forEach(([x, y]) => candidates.push({ place: 'center', x, y }));
    }

    candidates.push(
      { place: 'below', x: middleX, y: bottom + LABEL_GAP + label.height / 2 },
      { place: 'above', x: middleX, y: top - LABEL_GAP - label.height / 2 },
      { place: 'right', x: right + LABEL_GAP + label.width / 2, y: middleY },
    );

    const boxAt = ({ x, y }: PlacedAreaLabel): ScreenBox => ({
      left: x - label.width / 2,
      top: y - label.height / 2,
      right: x + label.width / 2,
      bottom: y + label.height / 2,
    });
    const spot = candidates.find((candidate) => {
      const box = boxAt(candidate);
      const padded = padBox(box, LABEL_PADDING);

      return (
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= screen.width &&
        box.bottom <= screen.height &&
        !taken.some((other) => boxesOverlap(padded, other)) &&
        !screen.isCovered(box)
      );
    });

    if (!spot) {
      spots[index] = { place: 'hidden' };
      return;
    }

    spots[index] = spot;
    taken.push(padBox(boxAt(spot), LABEL_PADDING));
  });

  return spots;
}

/**
 * The areas, largest first, by the box around each. Drawn in this order, an area inside another
 * lies on top of it, its edge clear of the larger one's fill.
 */
export function largestAreasFirst<T extends RescueMapArea>(
  areas: readonly T[],
): T[] {
  const extent = (area: T) => {
    const points = area.polygons.flat(2);

    if (points.length === 0) {
      return 0;
    }

    const lats = points.map(([lat]) => lat);
    const lngs = points.map(([, lng]) => lng);

    return (
      (Math.max(...lats) - Math.min(...lats)) *
      (Math.max(...lngs) - Math.min(...lngs))
    );
  };

  return [...areas].sort((a, b) => extent(b) - extent(a));
}

/** Changes whenever what an area draws or says does. */
export function areaSignature(
  area: RescueMapArea | RescueMapPublicZone,
): string {
  return [
    area.id,
    areaKind(area),
    JSON.stringify(area.polygons),
    ...areaPopupLines(area),
  ].join('|');
}
