/** The 全部 tile's key: no status filter. */
export const STAT_TILE_ALL = 'all';

/** A count not known yet, or one that failed to load, reads —, never 0 (STAT-105). */
export type StatTileCount = number | null;

/** A tile that filters by its key: 全部 (`STAT_TILE_ALL`) or a status. */
export interface StatTileItem {
  key: string;
  label: string;
  count: StatTileCount;
  /** What hovering the tile says, beyond its label. */
  title?: string;
}

/** A count in two parts, the second wrapping under the first when the tile is narrow (STAT-106). */
export interface StatTileParts {
  main: string;
  sub?: string;
}

/**
 * The status filter after a tile is picked (STAT-103): that tile's status, or none when the tile
 * already selected, or 全部, is picked — the way back to every row is the tile in hand.
 */
export function nextStatTile(current: string, picked: string): string {
  return picked === STAT_TILE_ALL || picked === current
    ? STAT_TILE_ALL
    : picked;
}
