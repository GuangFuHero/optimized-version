import { describe, expect, it } from 'vitest';

import { buildingEntries } from './building-entry';
import type { BuildingMapEntry } from './use-building-maps';

function building(
  uuid: string,
  name: string,
  address: string | null = null,
  counts: Pick<BuildingMapEntry, 'ticketCount' | 'shortfall'> = {
    ticketCount: null,
    shortfall: null,
  },
): BuildingMapEntry {
  return {
    uuid,
    name,
    address,
    point: [23.67, 121.42],
    floors: [],
    ...counts,
  };
}

const school = building('a', '大進國小', '花蓮縣光復鄉大進村大進路 1 號');
const office = building('b', '光復鄉公所', '花蓮縣光復鄉中正路二段 10 號');
const tower = building('c', 'Sunrise Tower', null);

const counted = (
  name: string,
  ticketCount: number,
  shortfall: number,
): BuildingMapEntry => building(name, name, null, { ticketCount, shortfall });

describe('buildingEntries', () => {
  it('lists a guest every building in name order: a guest is given no counts', () => {
    // As Traditional Chinese sorts, by strokes: 大 (3) before 光 (6).
    expect(
      buildingEntries([office, school], undefined).map((b) => b.name),
    ).toEqual(['大進國小', '光復鄉公所']);
  });

  it('puts those short of the most people first, then those with tickets, then those with none', () => {
    expect(
      buildingEntries(
        [
          counted('甲', 0, 0),
          counted('乙', 5, 0),
          counted('丙', 2, 4),
          counted('丁', 9, 1),
          counted('戊', 1, 0),
        ],
        undefined,
      ).map((b) => b.name),
    ).toEqual(['丙', '丁', '乙', '戊', '甲']);
  });

  it('goes back to name order between buildings as short and as full as each other', () => {
    expect(
      buildingEntries(
        [counted('光復鄉公所', 3, 2), counted('大進國小', 3, 2)],
        undefined,
      ).map((b) => b.name),
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
