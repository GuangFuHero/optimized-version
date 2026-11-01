import { describe, expect, it } from 'vitest';

import { MAP_VIEW_TAIWAN } from './constants';
import {
  isRememberedView,
  parseRememberedMapView,
  recordMapView,
  resolveMapOpening,
  sameMapView,
  settleEventMapView,
  toEventMapView,
  type RememberedMapView,
} from './map-opening';

const EVENT = { center: [23.67, 121.418] as [number, number], zoom: 14 };
const MOVED_EVENT = { center: [24.1, 121.6] as [number, number], zoom: 13 };
const LEFT_AT = { center: [23.7, 121.43] as [number, number], zoom: 16 };

/** Stored as `localStorage` would: what the next visit reads is what went through JSON. */
function stored(record: RememberedMapView | null) {
  return parseRememberedMapView(JSON.parse(JSON.stringify(record)));
}

describe('toEventMapView', () => {
  it("takes the event's centre and zoom", () => {
    expect(
      toEventMapView({ mapView: { lat: 23.67, lng: 121.418, zoom: 14 } }),
    ).toEqual(EVENT);
  });

  it('is null when the event sets no view, or there is no event yet', () => {
    expect(toEventMapView({ mapView: null })).toBeNull();
    expect(toEventMapView(null)).toBeNull();
  });
});

describe('sameMapView', () => {
  it('compares the centre and the zoom', () => {
    expect(sameMapView(EVENT, { ...EVENT, center: [...EVENT.center] })).toBe(
      true,
    );
    expect(sameMapView(EVENT, { ...EVENT, zoom: 15 })).toBe(false);
    expect(sameMapView(EVENT, MOVED_EVENT)).toBe(false);
  });

  it('takes two unset views as the same, and an unset one as unlike a set one', () => {
    expect(sameMapView(null, null)).toBe(true);
    expect(sameMapView(null, EVENT)).toBe(false);
    expect(sameMapView(EVENT, null)).toBe(false);
  });
});

describe('resolveMapOpening', () => {
  it("opens a first visit at the event's view", () => {
    expect(resolveMapOpening(null, EVENT)).toEqual({
      view: EVENT,
      restored: false,
      dropRemembered: false,
    });
  });

  it('opens at all of Taiwan when the event sets no view, or it could not be read', () => {
    expect(resolveMapOpening(null, null).view).toEqual(MAP_VIEW_TAIWAN);
    expect(resolveMapOpening(null, undefined).view).toEqual(MAP_VIEW_TAIWAN);
  });

  it('opens where the map was left while the event view is the one it was left under', () => {
    expect(resolveMapOpening({ ...LEFT_AT, eventView: EVENT }, EVENT)).toEqual({
      view: LEFT_AT,
      restored: true,
      dropRemembered: false,
    });
    expect(
      resolveMapOpening({ ...LEFT_AT, eventView: null }, null),
    ).toMatchObject({ view: LEFT_AT, restored: true });
  });

  it('drops the view the map was left at once the event view has changed', () => {
    expect(
      resolveMapOpening({ ...LEFT_AT, eventView: EVENT }, MOVED_EVENT),
    ).toEqual({ view: MOVED_EVENT, restored: false, dropRemembered: true });
  });

  it('drops it when an event view was set after, or cleared since', () => {
    // Left on staging before anyone set the event's view, the map opens at it once it is set.
    expect(resolveMapOpening({ ...LEFT_AT, eventView: null }, EVENT)).toEqual({
      view: EVENT,
      restored: false,
      dropRemembered: true,
    });
    expect(resolveMapOpening({ ...LEFT_AT, eventView: EVENT }, null)).toEqual({
      view: MAP_VIEW_TAIWAN,
      restored: false,
      dropRemembered: true,
    });
  });

  it('keeps the view the map was left at when the event could not be read', () => {
    expect(
      resolveMapOpening({ ...LEFT_AT, eventView: EVENT }, undefined),
    ).toEqual({ view: LEFT_AT, restored: true, dropRemembered: false });
  });
});

describe('recordMapView', () => {
  it('records the view with the event view it was left under', () => {
    expect(stored(recordMapView(LEFT_AT, EVENT, null))).toEqual({
      ...LEFT_AT,
      eventView: EVENT,
    });
    expect(stored(recordMapView(LEFT_AT, null, null))).toEqual({
      ...LEFT_AT,
      eventView: null,
    });
  });

  it('rounds the centre to three places, about 100 m', () => {
    expect(
      recordMapView(
        { center: [23.6704049, 121.4185051], zoom: 14 },
        EVENT,
        null,
      ),
    ).toMatchObject({ center: [23.67, 121.419] });
  });

  it('keeps the event view already recorded when the event could not be read', () => {
    expect(
      recordMapView(LEFT_AT, undefined, { ...MOVED_EVENT, eventView: EVENT }),
    ).toEqual({ ...LEFT_AT, eventView: EVENT });
    // Even once the event has been read since: a changed event still drops what was left.
    expect(
      recordMapView(
        LEFT_AT,
        undefined,
        { ...MOVED_EVENT, eventView: EVENT },
        MOVED_EVENT,
      ),
    ).toEqual({ ...LEFT_AT, eventView: EVENT });
  });

  it('records a first visit under the event view read after it opened', () => {
    // Opened while the event was still unread on a slow connection; the event arrived meanwhile.
    expect(stored(recordMapView(LEFT_AT, undefined, null, EVENT))).toEqual({
      ...LEFT_AT,
      eventView: EVENT,
    });
    expect(stored(recordMapView(LEFT_AT, undefined, null, null))).toEqual({
      ...LEFT_AT,
      eventView: null,
    });
  });

  it('records nothing when the event could not be read and there is no event view to keep', () => {
    expect(recordMapView(LEFT_AT, undefined, null)).toBeNull();
    expect(recordMapView(LEFT_AT, undefined, null, undefined)).toBeNull();
  });
});

describe('isRememberedView', () => {
  // The address names the view to seven places, as the map left it; the record keeps three.
  const ADDRESS = {
    center: [23.7001234, 121.4304567] as [number, number],
    zoom: 16,
  };

  it('knows the view this browser left in the address, to about 100 m', () => {
    const remembered = recordMapView(ADDRESS, EVENT, null);

    expect(isRememberedView(stored(remembered), ADDRESS)).toBe(true);
  });

  it('does not take a view someone shared, elsewhere or at another zoom, for its own', () => {
    const remembered = stored(recordMapView(LEFT_AT, EVENT, null));

    expect(isRememberedView(remembered, MOVED_EVENT)).toBe(false);
    expect(isRememberedView(remembered, { ...LEFT_AT, zoom: 15 })).toBe(false);
  });

  it('knows nothing with no view remembered, an address without a zoom, or no address', () => {
    const remembered = stored(recordMapView(LEFT_AT, EVENT, null));

    expect(isRememberedView(null, LEFT_AT)).toBe(false);
    expect(isRememberedView(remembered, { center: LEFT_AT.center })).toBe(
      false,
    );
    expect(isRememberedView(remembered, undefined)).toBe(false);
  });
});

describe('settleEventMapView', () => {
  const HELD = {
    currentDisaster: { mapView: { lat: 23.67, lng: 121.418, zoom: 14 } },
  };

  it('waits for a read made since the map mounted, though an answer is held from before', () => {
    expect(
      settleEventMapView({
        data: HELD,
        readSinceMount: false,
        waitedOut: false,
      }),
    ).toEqual({ ready: false, eventView: undefined });
  });

  it("takes the event's view once that read has answered", () => {
    expect(
      settleEventMapView({
        data: HELD,
        readSinceMount: true,
        waitedOut: false,
      }),
    ).toEqual({ ready: true, eventView: EVENT });
    expect(
      settleEventMapView({
        data: { currentDisaster: { mapView: null } },
        readSinceMount: true,
        waitedOut: false,
      }),
    ).toEqual({ ready: true, eventView: null });
  });

  it('keeps the answer held before when the read fails or does not come in time', () => {
    // A failed read leaves the data it had; so does one still out when the wait runs out.
    expect(
      settleEventMapView({
        data: HELD,
        readSinceMount: false,
        waitedOut: true,
      }),
    ).toEqual({ ready: true, eventView: EVENT });
    expect(
      settleEventMapView({
        data: undefined,
        readSinceMount: true,
        waitedOut: false,
      }),
    ).toEqual({ ready: true, eventView: undefined });
  });
});

describe('parseRememberedMapView', () => {
  it('reads back what was recorded', () => {
    const record = { ...LEFT_AT, eventView: EVENT };

    expect(stored(record)).toEqual(record);
  });

  it('reads nothing back from what is not a recorded view', () => {
    expect(parseRememberedMapView(null)).toBeNull();
    expect(parseRememberedMapView('23.7,121.43')).toBeNull();
    expect(
      parseRememberedMapView({ center: [23.7], zoom: 16, eventView: null }),
    ).toBeNull();
    expect(
      parseRememberedMapView({
        center: [23.7, 'x'],
        zoom: 16,
        eventView: null,
      }),
    ).toBeNull();
    expect(
      parseRememberedMapView({ ...LEFT_AT, eventView: { center: [1, 2] } }),
    ).toBeNull();
  });

  it('reads nothing back from a view recorded without its event view', () => {
    expect(parseRememberedMapView({ ...LEFT_AT })).toBeNull();
  });
});
