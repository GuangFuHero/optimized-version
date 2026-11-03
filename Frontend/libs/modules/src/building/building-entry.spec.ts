import { describe, expect, it } from 'vitest';

import { buildingEntries, buildingEntryCount } from './building-entry';
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

  it('puts those still short first, then those with tickets, then those with none', () => {
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
    ).toEqual(['丁', '丙', '乙', '戊', '甲']);
  });

  it('does not put more tickets first: they may all be done, as closed ones count too', () => {
    expect(
      buildingEntries(
        [counted('光復鄉公所', 9, 0), counted('大進國小', 1, 0)],
        undefined,
      ).map((b) => b.name),
    ).toEqual(['大進國小', '光復鄉公所']);
  });

  it('does not put the most short first: people and supplies do not add up', () => {
    expect(
      buildingEntries(
        [counted('光復鄉公所', 3, 53), counted('大進國小', 3, 2)],
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

describe('buildingEntryCount', () => {
  it('gives a guest 看各樓層: a guest is given no counts', () => {
    expect(buildingEntryCount({ ticketCount: null })).toBe('看各樓層');
  });

  it('says 還沒有求助, never 0 件, for a building with no tickets', () => {
    expect(buildingEntryCount({ ticketCount: 0 })).toBe('還沒有求助');
  });

  it('counts the tickets and never says what they are short', () => {
    const words = buildingEntryCount({ ticketCount: 7 });

    expect(words).toBe('7 件');
    expect(words).not.toContain('缺');
  });
});
