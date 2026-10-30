import { describe, expect, it } from 'vitest';

import {
  initialMapView,
  mapViewBody,
  mapViewFromMap,
  sameMapView,
} from './map-view';

describe('地圖預設位置', () => {
  it('saves a whole zoom within 7 to 18, as the backend takes no other', () => {
    const at = (zoom: number) => ({ lat: 23.67, lng: 121.418, zoom });
    expect(mapViewFromMap(at(13.6)).zoom).toBe(14);
    expect(mapViewFromMap(at(6.4)).zoom).toBe(7);
    expect(mapViewFromMap(at(18.7)).zoom).toBe(18);
    expect(mapViewFromMap(at(14)).zoom).toBe(14);
  });

  it('keeps the centre to 5 decimals, about a metre', () => {
    expect(
      mapViewFromMap({ lat: 23.6712345, lng: 121.4187654, zoom: 14 }),
    ).toEqual({
      lat: 23.67123,
      lng: 121.41877,
      zoom: 14,
    });
  });

  it('counts a view within 1e-4 of the saved one, at its zoom, as the same', () => {
    const saved = { lat: 23.67, lng: 121.418, zoom: 14 };
    expect(
      sameMapView(saved, { lat: 23.67005, lng: 121.41795, zoom: 14 }),
    ).toBe(true);
    expect(sameMapView(saved, { lat: 23.6702, lng: 121.418, zoom: 14 })).toBe(
      false,
    );
    expect(sameMapView(saved, { lat: 23.67, lng: 121.418, zoom: 15 })).toBe(
      false,
    );
    expect(sameMapView(null, saved)).toBe(false);
    expect(sameMapView(saved, null)).toBe(false);
  });

  it('opens on the saved view, or on all of Taiwan when none is set', () => {
    const saved = { lat: 23.67, lng: 121.418, zoom: 14 };
    expect(initialMapView(saved)).toEqual(saved);
    expect(initialMapView(null)).toEqual({ lat: 23.65, lng: 120.95, zoom: 7 });
    expect(initialMapView(undefined)).toEqual({
      lat: 23.65,
      lng: 120.95,
      zoom: 7,
    });
  });

  it('sends the view whole to set it, and null to clear it', () => {
    const view = { lat: 23.67, lng: 121.418, zoom: 14 };
    expect(mapViewBody(view)).toEqual({ map_view: view });
    expect(mapViewBody(null)).toEqual({ map_view: null });
  });
});
