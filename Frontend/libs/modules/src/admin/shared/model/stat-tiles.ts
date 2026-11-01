/** The 全部 tile's key: no status filter. */
export const STAT_TILE_ALL = 'all';

/** A count not known yet, or one that failed to load, reads —, never 0 (STAT-105). */
export type StatTileCount = number | null;

/** A tile that filters by its key: 全部 (`STAT_TILE_ALL`) or a status. */
export interface StatTileItem<K extends string = string> {
  key: K | typeof STAT_TILE_ALL;
  label: string;
  count: StatTileCount;
  /** What hovering the tile says, instead of 只看「…」 or 再點一次取消篩選. */
  title?: string;
}

/** A count in two parts, the second wrapping under the first when the tile is narrow (STAT-106). */
export interface StatTileParts {
  main: string;
  sub?: string;
}

/**
 * The status filter after a tile is picked (STAT-103): that tile's status, or none (null) when the
 * tile already selected, or 全部, is picked — the way back to every row is the tile in hand.
 */
export function nextStatTile<K extends string>(
  current: K | null,
  picked: K | typeof STAT_TILE_ALL,
): K | null {
  if (picked === STAT_TILE_ALL) return null;
  return picked === current ? null : picked;
}
