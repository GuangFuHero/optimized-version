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
});
