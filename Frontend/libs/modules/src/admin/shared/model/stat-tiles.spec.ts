import { describe, expect, it } from 'vitest';

import { nextStatTile, STAT_TILE_ALL } from './stat-tiles';

describe('nextStatTile', () => {
  it('filters to the tile picked', () => {
    expect(nextStatTile(null, 'pending')).toBe('pending');
    expect(nextStatTile('pending', 'completed')).toBe('completed');
  });

  it('clears the filter when the picked tile is picked again', () => {
    expect(nextStatTile('pending', 'pending')).toBeNull();
  });

  it('clears the filter from 全部, picked or picked again', () => {
    expect(nextStatTile('pending', STAT_TILE_ALL)).toBeNull();
    expect(nextStatTile(null, STAT_TILE_ALL)).toBeNull();
  });
});
