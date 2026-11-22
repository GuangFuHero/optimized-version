import { map as createMap } from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMapViewport } from '../src/viewport.ts';

describe('observeMapViewport', () => {
  const host = document.createElement('div');
  let map: ReturnType<typeof createMap>;

  beforeEach(() => {
    map = createMap(host, { center: [23, 181], zoom: 8 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    map.remove();
    vi.useRealTimers();
  });

  it('reports the native view immediately and optionally wraps the center only', () => {
    const report = vi.fn();
    const stop = observeMapViewport(map, report, { wrapLongitude: true });

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({
      center: [23, -179],
      zoom: 8,
      west: map.getBounds().getWest(),
      east: map.getBounds().getEast(),
      south: map.getBounds().getSouth(),
      north: map.getBounds().getNorth(),
    });
    stop();
  });

  it('coalesces moves, emits repeated views and drops pending work on detach', () => {
    const report = vi.fn();
    const stop = observeMapViewport(map, report, {
      settleMs: 250,
      reportInitial: false,
    });

    map.setView([24, 121], 9);
    vi.advanceTimersByTime(150);
    map.setView([25, 121], 9);
    vi.advanceTimersByTime(249);
    expect(report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ center: [25, 121], zoom: 9 }),
    );

    map.fire('moveend');
    vi.advanceTimersByTime(250);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0][0]).not.toBe(report.mock.calls[1][0]);

    map.fire('moveend');
    stop();
    vi.advanceTimersByTime(250);
    expect(report).toHaveBeenCalledTimes(2);
  });
});
