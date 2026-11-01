import { describe, expect, it } from 'vitest';

import {
  framingMove,
  framingOf,
  framingStep,
  selectedFocusStep,
  ticketMapNotice,
} from './map-framing';

describe('framingOf', () => {
  const box = {
    count: 3,
    minLat: 22.6,
    maxLat: 25.0,
    minLng: 120.3,
    maxLng: 121.6,
  };

  it('leaves the view alone when nothing matches', () => {
    expect(framingOf({ count: 0 })).toEqual({ kind: 'none' });
    expect(
      framingOf({
        count: 0,
        minLat: null,
        maxLat: null,
        minLng: null,
        maxLng: null,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('goes to a lone point, or to points that all coincide', () => {
    const point = { minLat: 23.5, maxLat: 23.5, minLng: 121.2, maxLng: 121.2 };
    expect(framingOf({ count: 1, ...point })).toEqual({
      kind: 'point',
      point: [23.5, 121.2],
    });
    expect(framingOf({ count: 2, ...point })).toEqual({
      kind: 'point',
      point: [23.5, 121.2],
    });
  });

  it('boxes several points', () => {
    expect(framingOf(box)).toEqual({
      kind: 'bounds',
      southWest: [22.6, 120.3],
      northEast: [25.0, 121.6],
    });
  });

  it('boxes every match, however many there are', () => {
    expect(framingOf({ ...box, count: 5000 })).toEqual({
      kind: 'bounds',
      southWest: [22.6, 120.3],
      northEast: [25.0, 121.6],
    });
  });
});

describe('framingStep', () => {
  it('frames a new request once, and leaves later loads of it alone', () => {
    expect(framingStep(null, 'a#0', false)).toBe('frame');
    expect(framingStep('a#0', 'a#0', false)).toBe('done');
    expect(framingStep('a#0', 'b#0', false)).toBe('frame');
    expect(framingStep('a#0', 'a#1', false)).toBe('frame');
  });

  it('keeps the view on an open ticket, and counts the request as done', () => {
    expect(framingStep(null, 'a#0', true)).toBe('skip');
    expect(framingStep('a#0', 'a#0', true)).toBe('done');
  });
});

describe('framingMove', () => {
  const box = {
    count: 3,
    minLat: 22.6,
    maxLat: 25.0,
    minLng: 120.3,
    maxLng: 121.6,
  };
  const nullEdges = {
    count: 2,
    minLat: null,
    maxLat: null,
    minLng: null,
    maxLng: null,
  };

  it('moves to the box when framing', () => {
    expect(framingMove('frame', box)).toEqual({
      kind: 'move',
      framing: framingOf(box),
    });
  });

  // Each 'stay' loads the current view at once: no setView, so no moveend to wait for.
  it('stays when the open ticket keeps the view', () => {
    expect(framingMove('skip', box)).toEqual({ kind: 'stay' });
  });

  it('stays when nothing matches', () => {
    expect(framingMove('frame', { count: 0 })).toEqual({ kind: 'stay' });
  });

  it('stays when the box has no edges', () => {
    expect(framingMove('frame', nullEdges)).toEqual({ kind: 'stay' });
  });
});

describe('selectedFocusStep', () => {
  const base = {
    selectedUuid: 't-1',
    focusedUuid: null,
    loadedIds: new Set<string>(),
    detailLoaded: true,
    point: [23.5, 121.2] as const,
  };

  it("goes to the open ticket's point when its pin is not on the map", () => {
    expect(selectedFocusStep(base)).toEqual({ point: [23.5, 121.2] });
  });

  it('decides without moving when the pin is already on the map', () => {
    expect(selectedFocusStep({ ...base, loadedIds: new Set(['t-1']) })).toEqual(
      { point: null },
    );
  });

  it('decides without moving for a ticket with no point', () => {
    expect(selectedFocusStep({ ...base, point: null })).toEqual({
      point: null,
    });
  });

  it('waits for the detail, and decides once per ticket', () => {
    expect(selectedFocusStep({ ...base, detailLoaded: false })).toBeNull();
    expect(selectedFocusStep({ ...base, focusedUuid: 't-1' })).toBeNull();
    expect(selectedFocusStep({ ...base, selectedUuid: null })).toBeNull();
  });
});

describe('ticketMapNotice', () => {
  const base = { failed: false, inViewTotal: 3, shown: 3, matchingTotal: 3 };

  it('says nothing when the view shows every matching ticket in it', () => {
    expect(ticketMapNotice(base)).toBeNull();
  });

  it('puts a failed load first', () => {
    expect(ticketMapNotice({ ...base, failed: true, inViewTotal: null })).toBe(
      'error',
    );
  });

  it('asks to zoom in when the view holds more than it draws', () => {
    expect(ticketMapNotice({ ...base, inViewTotal: 250, shown: 200 })).toBe(
      'zoom-in',
    );
    expect(
      ticketMapNotice({
        ...base,
        inViewTotal: 250,
        shown: 200,
        matchingTotal: 900,
      }),
    ).toBe('zoom-in');
  });

  it('points elsewhere when none are in view but some match', () => {
    expect(ticketMapNotice({ ...base, inViewTotal: 0, shown: 0 })).toBe(
      'none-here',
    );
    // Every match counts, not just the first page of them.
    expect(
      ticketMapNotice({
        ...base,
        inViewTotal: 0,
        shown: 0,
        matchingTotal: 900,
      }),
    ).toBe('none-here');
    expect(
      ticketMapNotice({
        ...base,
        inViewTotal: 0,
        shown: 0,
        matchingTotal: null,
      }),
    ).toBeNull();
  });

  it('says there is nothing to show once no ticket matches anywhere', () => {
    expect(
      ticketMapNotice({ ...base, inViewTotal: 0, shown: 0, matchingTotal: 0 }),
    ).toBe('empty');
  });

  it('waits for the view to load', () => {
    expect(
      ticketMapNotice({ ...base, inViewTotal: null, shown: 0 }),
    ).toBeNull();
  });
});
