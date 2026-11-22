// SPDX-License-Identifier: GPL-3.0-only
import type { RescueMapArea, RescueMapPublicZone } from './types';

/** What each kind of area is called (prototype back office `ZONE_KINDS`, `map-data.js:108-112`). */
export const AREA_KIND_LABELS = {
  hazardous_zone: '危險區',
  team_zone: '責任區',
  mark_zone: '標示區',
} as const;

export type RescueMapAreaKind = keyof typeof AREA_KIND_LABELS;

export const AREA_KIND_ORDER = [
  'hazardous_zone',
  'team_zone',
  'mark_zone',
] as const satisfies readonly RescueMapAreaKind[];

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
 * 「負責：A、B」: who a 責任區 is assigned to, as its label's popup and a ticket's detail both write it.
 * Null when there is nobody to name.
 */
export function responsibleTeamsText(teams: readonly string[]): string | null {
  return teams.length > 0 ? `負責：${teams.join('、')}` : null;
}

/**
 * What tapping an area's label tells (prototype ZONE-CLICK-101): its title, the teams of a 責任區,
 * and its note. One per line, as a note can run long.
 */
export function areaPopupLines(
  area: RescueMapArea | RescueMapPublicZone,
): string[] {
  const teams = 'teams' in area ? responsibleTeamsText(area.teams) : null;

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

/** Changes whenever what an area draws or says does. */
export function areaSignature(
  area: RescueMapArea | RescueMapPublicZone,
): string {
  return [
    area.id,
    areaKind(area),
    JSON.stringify(area.polygons),
    'isPublic' in area ? String(area.isPublic) : '',
    String(area.highlighted ?? false),
    String(area.dimmed ?? false),
    ...areaPopupLines(area),
  ].join('|');
}
