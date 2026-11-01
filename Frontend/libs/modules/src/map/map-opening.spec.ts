import { describe, expect, it } from 'vitest';

import { MAP_VIEW_TAIWAN } from './constants';
import {
  parseRememberedMapView,
  recordMapView,
  resolveMapOpening,
  settleEventMapView,
  toEventMapView,
} from './map-opening';
import type { RescueMapView } from './types';

const EVENT = { center: [23.67, 121.418] as [number, number], zoom: 14 };
const MOVED_EVENT = { center: [24.1, 121.6] as [number, number], zoom: 13 };
const LEFT_AT = { center: [23.7, 121.43] as [number, number], zoom: 16 };

/** Stored as `localStorage` would: what the next visit reads is what went through JSON. */
function stored(record: RescueMapView) {
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

describe('resolveMapOpening', () => {
  it("opens a first visit at the event's view", () => {
    expect(resolveMapOpening(null, EVENT)).toEqual({
      view: EVENT,
      restored: false,
    });
  });

  it('opens at all of Taiwan when the event sets no view, or it could not be read', () => {
    expect(resolveMapOpening(null, null).view).toEqual(MAP_VIEW_TAIWAN);
    expect(resolveMapOpening(null, undefined).view).toEqual(MAP_VIEW_TAIWAN);
  });

  it('opens where the map was left', () => {
    expect(resolveMapOpening(LEFT_AT, EVENT)).toEqual({
      view: LEFT_AT,
      restored: true,
    });
  });

  it("opens where the map was left though the event's view has changed, been set or cleared", () => {
    expect(resolveMapOpening(LEFT_AT, MOVED_EVENT)).toEqual({
      view: LEFT_AT,
      restored: true,
    });
    expect(resolveMapOpening(LEFT_AT, null).view).toEqual(LEFT_AT);
    expect(resolveMapOpening(LEFT_AT, undefined).view).toEqual(LEFT_AT);
  });
});

describe('recordMapView', () => {
  it('records the centre and the zoom', () => {
    expect(stored(recordMapView(LEFT_AT))).toEqual(LEFT_AT);
  });

  it('rounds the centre to three places, about 100 m', () => {
    expect(
      recordMapView({ center: [23.6704049, 121.4185051], zoom: 14 }),
    ).toEqual({ center: [23.67, 121.419], zoom: 14 });
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
    expect(stored(LEFT_AT)).toEqual(LEFT_AT);
  });

  it('reads the view out of one recorded with the event view of the time', () => {
    expect(parseRememberedMapView({ ...LEFT_AT, eventView: EVENT })).toEqual(
      LEFT_AT,
    );
    expect(parseRememberedMapView({ ...LEFT_AT, eventView: null })).toEqual(
      LEFT_AT,
    );
  });

  it('reads nothing back from what is not a recorded view', () => {
    expect(parseRememberedMapView(null)).toBeNull();
    expect(parseRememberedMapView('23.7,121.43')).toBeNull();
    expect(parseRememberedMapView({ center: [23.7], zoom: 16 })).toBeNull();
    expect(
      parseRememberedMapView({ center: [23.7, 'x'], zoom: 16 }),
    ).toBeNull();
  });
});
