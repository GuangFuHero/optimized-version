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

/**
 * What hovering over an area, or tapping it, tells (prototype `site-map.jsx:614`): its name, the
 * teams of a 責任區, and its note. One per line, as a note can run long.
 */
export function areaTooltipLines(
  area: RescueMapArea | RescueMapPublicZone,
): string[] {
  const teams =
    'teams' in area && area.teams.length > 0
      ? `負責：${area.teams.join('、')}`
      : null;

  return [area.label, teams, area.comment?.trim()].filter(
    (line): line is string => Boolean(line),
  );
}

/**
 * The areas, largest first, by the box around each. Drawn in this order, an area inside another
 * lies on top of it, so hovering over it tells about it rather than about the one around it.
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
    'kind' in area ? area.kind : 'hazardous_zone',
    JSON.stringify(area.polygons),
    ...areaTooltipLines(area),
  ].join('|');
}
