import { describe, expect, it } from 'vitest';

import { createPointShareTarget } from './target';

const station = {
  id: 'station-1',
  title: '光復國小',
  subtitle: '飲水站',
  detailType: 'station' as const,
};

describe('createPointShareTarget', () => {
  it('leaves the base layer to whoever opens the link when the sharer picked none', () => {
    const target = createPointShareTarget({
      marker: station,
      module: 'map',
      state: {},
      origin: 'https://example.test',
    });

    expect(target.url).toBe('https://example.test/map/station?id=station-1');
  });

  it('carries the base layer the sharer picked', () => {
    const target = createPointShareTarget({
      marker: station,
      module: 'map',
      state: { baseLayer: 'nlsc' },
      origin: 'https://example.test',
    });

    expect(target.url).toBe(
      'https://example.test/map/nlsc/station?id=station-1',
    );
  });

  it("describes a station by what it is, not by the marker's subtitle, which may be its level", () => {
    // A map marker, as `mapStationToMarker` makes one for a station with no words and no hours.
    const marker = {
      ...station,
      subtitle: '等級 0',
      stationMeta: { type: 'water', description: null, opHour: null },
    };
    const target = createPointShareTarget({
      marker,
      module: 'map',
      state: {},
      origin: 'https://example.test',
    });

    expect(target.description).toBe('島嶼守望｜加水站點');
  });
});
