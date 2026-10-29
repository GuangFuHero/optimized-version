import { describe, expect, it } from 'vitest';

import { decideStationFit, type StationFitInput } from './station-map-fit';

const FIRST_OPEN: StationFitInput = {
  filtersKey: '',
  framedKey: null,
  loading: false,
  restored: false,
  selected: false,
  pointCount: 3,
};

const SETTLED: StationFitInput = { ...FIRST_OPEN, framedKey: '' };

describe('decideStationFit', () => {
  it("frames the stations once they are read, on a map opened at the event's view", () => {
    expect(decideStationFit({ ...FIRST_OPEN, loading: true })).toBe('wait');
    expect(decideStationFit(FIRST_OPEN)).toBe('frame');
  });

  it('leaves a map opened where it was left, even once the stations arrive', () => {
    const restored = { ...FIRST_OPEN, restored: true };

    expect(decideStationFit({ ...restored, loading: true })).toBe('wait');
    expect(decideStationFit(restored)).toBe('keep');
  });

  it('frames again when the filters change, once their stations are read', () => {
    const changed = { ...SETTLED, filtersKey: 'type=shelter', restored: true };

    expect(decideStationFit({ ...changed, loading: true })).toBe('wait');
    expect(decideStationFit(changed)).toBe('frame');
  });

  it('does not frame again for the filters it already framed or left alone', () => {
    // A station added, edited or deleted is read again, and freshness moves with the clock: the
    // filters stay the same, so the view stays where it is.
    expect(decideStationFit(SETTLED)).toBe('wait');
    expect(decideStationFit({ ...SETTLED, pointCount: 4 })).toBe('wait');
  });

  it('keeps the view on a selected station, and counts those filters as handled', () => {
    expect(
      decideStationFit({
        ...SETTLED,
        filtersKey: 'status=active',
        selected: true,
      }),
    ).toBe('keep');
  });

  it('has nothing to frame when no station has a point', () => {
    expect(decideStationFit({ ...FIRST_OPEN, pointCount: 0 })).toBe('keep');
  });
});
