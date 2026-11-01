import { describe, expect, it } from 'vitest';

import { stationStatTiles } from './station-stats';

describe('stationStatTiles', () => {
  it('gives 全部 and each operational status a tile, from the counts over every station', () => {
    expect(
      stationStatTiles({
        total: 12,
        byStatus: [
          { status: 'active', count: 9 },
          { status: 'temporarily_closed', count: 3 },
        ],
      }),
    ).toEqual([
      { key: 'all', label: '全部', count: 12 },
      { key: 'active', label: '開設中', count: 9 },
      { key: 'temporarily_closed', label: '暫時關閉', count: 3 },
      // No station in it is a count of 0 once the counts are in, not —.
      { key: 'permanently_closed', label: '永久關閉', count: 0 },
    ]);
  });

  it('draws no row while the counts are not in, or with no station', () => {
    expect(stationStatTiles(null)).toBeNull();
    expect(stationStatTiles({ total: 0, byStatus: [] })).toBeNull();
  });
});
