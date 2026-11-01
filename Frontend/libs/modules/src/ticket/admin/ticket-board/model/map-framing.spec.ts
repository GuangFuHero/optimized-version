import { describe, expect, it } from 'vitest';

import { MAP_VIEW_MIN_ZOOM } from '../../../../map/constants';
import {
  boxFitsWhole,
  framingMove,
  framingOf,
  framingStep,
  outsideCount,
  selectedFocusStep,
  TICKET_MAP_HEIGHT,
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

  it('keeps the view the map was left at for the first request, and frames the next', () => {
    expect(framingStep(null, 'a#0', false, true)).toBe('skip');
    // Another filter set, or 顯示全部.
    expect(framingStep('a#0', 'b#0', false, true)).toBe('frame');
    expect(framingStep('a#0', 'a#1', false, true)).toBe('frame');
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

  // One ticket in Boston and the rest in Taiwan: a box the map cannot zoom out far enough to show.
  // Fitted, it would land in the box's middle, in the Mediterranean.
  const wide = { ...box, minLat: 23.6, maxLat: 42.35, minLng: -71.05 };

  it("goes to the event's view when the box cannot be shown whole", () => {
    expect(framingMove('frame', wide, () => false)).toEqual({ kind: 'home' });
  });

  it('moves to a box that can be shown whole', () => {
    expect(framingMove('frame', box, () => true)).toEqual({
      kind: 'move',
      framing: framingOf(box),
    });
  });

  it('goes to a lone point without asking whether it fits', () => {
    const point = { minLat: 23.5, maxLat: 23.5, minLng: 121.2, maxLng: 121.2 };
    expect(framingMove('frame', { count: 1, ...point }, () => false)).toEqual({
      kind: 'move',
      framing: { kind: 'point', point: [23.5, 121.2] },
    });
  });

  it('keeps the view on an open ticket, however wide the box', () => {
    expect(framingMove('skip', wide, () => false)).toEqual({ kind: 'stay' });
  });
});

describe('boxFitsWhole', () => {
  // The board's map is the wider of two columns on a desktop: some 640px on a 1280px-wide screen.
  const desktop = { x: 640, y: TICKET_MAP_HEIGHT };
  // Kinmen and Penghu in the west and south, Matsu in the north, Hualien in the east.
  const outlyingIslands = {
    southWest: [21.9, 118.2] as const,
    northEast: [26.4, 122.1] as const,
  };
  const withBoston = {
    southWest: [23.6, -71.05] as const,
    northEast: [42.35, 121.6] as const,
  };

  it('shows Taiwan with its outlying islands whole, at the widest zoom', () => {
    expect(boxFitsWhole(outlyingIslands, desktop, MAP_VIEW_MIN_ZOOM)).toBe(
      true,
    );
  });

  it('cannot show a box that reaches Boston', () => {
    expect(boxFitsWhole(withBoston, desktop, MAP_VIEW_MIN_ZOOM)).toBe(false);
  });

  it('cannot show the outlying islands whole in a phone-wide column', () => {
    expect(
      boxFitsWhole(
        outlyingIslands,
        { x: 360, y: TICKET_MAP_HEIGHT },
        MAP_VIEW_MIN_ZOOM,
      ),
    ).toBe(false);
  });
});

describe('outsideCount', () => {
  it('counts the matches the view leaves out, after a framing that went home', () => {
    expect(
      outsideCount({ wentHome: true, inViewTotal: 12, matchingTotal: 13 }),
    ).toBe(1);
    expect(
      outsideCount({ wentHome: true, inViewTotal: 0, matchingTotal: 2 }),
    ).toBe(2);
  });

  it('says nothing after any other framing, or with every match in view', () => {
    expect(
      outsideCount({ wentHome: false, inViewTotal: 12, matchingTotal: 13 }),
    ).toBeNull();
    expect(
      outsideCount({ wentHome: true, inViewTotal: 13, matchingTotal: 13 }),
    ).toBeNull();
  });

  it('waits for both counts', () => {
    expect(
      outsideCount({ wentHome: true, inViewTotal: null, matchingTotal: 13 }),
    ).toBeNull();
    expect(
      outsideCount({ wentHome: true, inViewTotal: 12, matchingTotal: null }),
    ).toBeNull();
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

  // There 顯示全部 would only frame the same box and go home again: the count of those outside says it.
  it('does not point elsewhere after a framing that went home', () => {
    expect(
      ticketMapNotice({ ...base, inViewTotal: 0, shown: 0, wentHome: true }),
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
