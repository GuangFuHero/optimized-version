// SPDX-License-Identifier: GPL-3.0-only
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

export interface LabelRequest {
  priority?: number;
  /** The box around the area, though it reach off the screen. */
  area: ScreenBox;
  label: PixelSize;
}

/** Where a label's middle goes: inside its area, or beside it. */
export interface PlacedLabel {
  place: 'center' | 'below' | 'above' | 'right';
  x: number;
  y: number;
}

/** A label's place, or that it is left out this time: no place was clear, or its area is off screen. */
export type LabelSpot = PlacedLabel | { place: 'hidden' | 'offscreen' };

export interface LabelScreen extends PixelSize {
  /** Cell counts and pins, which stay where they are: a label keeps clear of them. */
  obstacles: readonly ScreenBox[];
  /** Whether something floats over this part of the map, a button or a card. */
  isCovered?: (label: ScreenBox) => boolean;
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
 * Places higher-priority labels first, then smaller areas. Tries the inside of the
 * visible area, then below, above, and to the right. Hides labels with no clear space.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  screen: LabelScreen,
): LabelSpot[] {
  const taken = screen.obstacles.map((box) => padBox(box, LABEL_PADDING));
  const spots: LabelSpot[] = requests.map(() => ({ place: 'offscreen' }));
  const size = ({ area }: LabelRequest) =>
    Math.abs((area.right - area.left) * (area.bottom - area.top));
  const order = requests
    .map((request, index) => ({ request, index }))
    .sort(
      (a, b) =>
        (b.request.priority ?? 0) - (a.request.priority ?? 0) ||
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
    const candidates: PlacedLabel[] = [];

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

    const boxAt = ({ x, y }: PlacedLabel): ScreenBox => ({
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
        !screen.isCovered?.(box)
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
