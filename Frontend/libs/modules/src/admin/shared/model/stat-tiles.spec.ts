import { describe, expect, it } from 'vitest';

import { nextStatTile, STAT_TILE_ALL } from './stat-tiles';

describe('nextStatTile', () => {
  it('filters to the tile picked', () => {
    expect(nextStatTile(STAT_TILE_ALL, 'pending')).toBe('pending');
    expect(nextStatTile('pending', 'completed')).toBe('completed');
  });

  it('clears the filter when the picked tile is picked again', () => {
    expect(nextStatTile('pending', 'pending')).toBe(STAT_TILE_ALL);
  });

  it('clears the filter from 全部, picked or picked again', () => {
    expect(nextStatTile('pending', STAT_TILE_ALL)).toBe(STAT_TILE_ALL);
    expect(nextStatTile(STAT_TILE_ALL, STAT_TILE_ALL)).toBe(STAT_TILE_ALL);
  });
});
