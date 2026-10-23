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
 * 「責任區・大平村」: its kind and name, as the label on the map writes it (prototype
 * `site-map.jsx`, ZONE-STYLE-102), so a phone, which has no hover, tells the kinds apart. An area
 * without a name is its kind alone.
 */
export function areaTitle(area: RescueMapArea | RescueMapPublicZone): string {
  const kind = AREA_KIND_LABELS[areaKind(area)];

  return area.name ? `${kind}・${area.name}` : kind;
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

interface PixelSize {
  width: number;
  height: number;
}

/**
 * Where an area's label goes at the present zoom (prototype ZONE-LABEL-101): in its middle when the
 * area has room for it with 8px to spare all round, else just below it. A label must not cover its
 * own area, and a 休息區 is always small. Measured in pixels on screen, not by zoom level, as areas
 * differ so much in size.
 */
export function areaLabelPlacement(
  area: PixelSize,
  label: PixelSize,
): 'center' | 'below' {
  return area.width >= label.width + 16 && area.height >= label.height + 16
    ? 'center'
    : 'below';
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
