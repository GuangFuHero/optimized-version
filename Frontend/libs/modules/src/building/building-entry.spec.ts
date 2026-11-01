import { describe, expect, it } from 'vitest';

import { buildingEntries } from './building-entry';
import type { BuildingMapEntry } from './use-building-maps';

function building(
  uuid: string,
  name: string,
  address: string | null = null,
): BuildingMapEntry {
  return { uuid, name, address, point: [23.67, 121.42], floors: [] };
}

const school = building('a', '大進國小', '花蓮縣光復鄉大進村大進路 1 號');
const office = building('b', '光復鄉公所', '花蓮縣光復鄉中正路二段 10 號');
const tower = building('c', 'Sunrise Tower', null);

describe('buildingEntries', () => {
  it('lists every building in name order when nothing is searched', () => {
    // As Traditional Chinese sorts, by strokes: 大 (3) before 光 (6).
    expect(
      buildingEntries([office, school], undefined).map((b) => b.name),
    ).toEqual(['大進國小', '光復鄉公所']);
  });

  it('keeps the buildings whose name or address holds the search', () => {
    expect(buildingEntries([school, office], '光復鄉公所')).toEqual([office]);
    // 中正路 is only in the office's address.
    expect(buildingEntries([school, office], '中正路')).toEqual([office]);
    expect(buildingEntries([school, tower], 'sunrise')).toEqual([tower]);
  });

  it('leaves none when nothing matches', () => {
    expect(buildingEntries([school, office], '鳳林')).toEqual([]);
  });
});
