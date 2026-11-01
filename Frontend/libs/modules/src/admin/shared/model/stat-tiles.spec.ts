import { describe, expect, it } from 'vitest';

import { nextStatTile, STAT_TILE_ALL, statCountsFailed } from './stat-tiles';

describe('statCountsFailed', () => {
  it('is not failed before any answer', () => {
    expect(statCountsFailed({ errorUpdatedAt: 0, dataUpdatedAt: 0 })).toBe(
      false,
    );
  });

  it('stays failed until counts come in after the failure, through a retry', () => {
    expect(statCountsFailed({ errorUpdatedAt: 20, dataUpdatedAt: 0 })).toBe(
      true,
    );
    expect(statCountsFailed({ errorUpdatedAt: 20, dataUpdatedAt: 10 })).toBe(
      true,
    );
    expect(statCountsFailed({ errorUpdatedAt: 20, dataUpdatedAt: 30 })).toBe(
      false,
    );
  });
});

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
