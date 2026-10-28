import { describe, expect, it } from 'vitest';

import { MAP_VIEW_TAIWAN } from './constants';
import {
  parseRememberedMapView,
  recordMapView,
  resolveMapOpening,
  sameMapView,
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

  it('rounds the centre to five places, about a metre', () => {
    expect(
      recordMapView(
        { center: [23.6700049, 121.4180051], zoom: 14 },
        EVENT,
        null,
      ),
    ).toMatchObject({ center: [23.67, 121.41801] });
  });

  it('keeps the event view already recorded when the event could not be read', () => {
    expect(
      recordMapView(LEFT_AT, undefined, { ...MOVED_EVENT, eventView: EVENT }),
    ).toEqual({ ...LEFT_AT, eventView: EVENT });
  });

  it('records nothing when the event could not be read and there is no event view to keep', () => {
    expect(recordMapView(LEFT_AT, undefined, null)).toBeNull();
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
