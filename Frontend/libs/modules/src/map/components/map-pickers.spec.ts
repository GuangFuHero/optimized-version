// @vitest-environment jsdom
import L from 'leaflet';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { RescueMapView } from '../types';
import { LocationPickerCanvas } from './location-picker/location-picker-canvas';
import type { PickedPoint } from './location-picker/types';
import { MapViewPickerCanvas } from './map-view-picker/map-view-picker-canvas';
import type {
  MapViewPickerRequest,
  MapViewValue,
} from './map-view-picker/types';

/** An observer method jsdom never uses. */
const doNothing = () => undefined;

/** The size Leaflet measures its container at. jsdom lays nothing out, so the test says. */
const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

const resizeObservers: ResizeObserverStub[] = [];

/** jsdom has no `ResizeObserver`, and both canvases watch their host for resizes. */
class ResizeObserverStub implements ResizeObserver {
  disconnected = false;
  observed: Element[] = [];

  constructor() {
    resizeObservers.push(this);
  }

  observe(target: Element) {
    this.observed.push(target);
  }

  unobserve = doNothing;

  disconnect() {
    this.disconnected = true;
  }
}

/** Every map Leaflet built, so the test can read what the canvases keep to themselves. */
const builtMaps: L.Map[] = [];

let unmeasured: (() => void) | null = null;

beforeAll(() => {
  const prototype = HTMLElement.prototype;
  const original = {
    clientWidth: Object.getOwnPropertyDescriptor(prototype, 'clientWidth'),
    clientHeight: Object.getOwnPropertyDescriptor(prototype, 'clientHeight'),
  };

  // jsdom lays nothing out, so Leaflet would measure a map of no width and no height.
  Object.defineProperty(prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('leaflet-container') ? MAP_WIDTH : 0;
    },
  });
  Object.defineProperty(prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('leaflet-container') ? MAP_HEIGHT : 0;
    },
  });

  unmeasured = () => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) {
        Object.defineProperty(prototype, name, descriptor);
      }
    }
  };

  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

  // Leaflet's own hook, run as every map is made: these canvases hold their map in a ref.
  L.Map.addInitHook(function (this: L.Map) {
    builtMaps.push(this);
  });
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  resizeObservers.length = 0;
  builtMaps.length = 0;
});

afterAll(() => {
  unmeasured?.();
});

const EVENT_VIEW: RescueMapView = { center: [23.6, 120.9], zoom: 8 };
/** A point is looked at close enough to tell which street it is on. */
const PICKED_ZOOM = 17;

let container: HTMLDivElement;
let root: Root;

async function renderPanel(element: ReactElement) {
  await act(async () => root.render(element));
  await settle();
}

function rerender(element: ReactElement) {
  return act(async () => root.render(element));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

function onlyMap(): L.Map {
  expect(builtMaps).toHaveLength(1);
  return builtMaps[0];
}

/** The markers on the small map. */
function markersOn(map: L.Map): L.Marker[] {
  const markers: L.Marker[] = [];

  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      markers.push(layer);
    }
  });

  return markers;
}

/** The pin a point is marked with: the one marker the location picker draws. */
function pinOf(map: L.Map): L.Marker {
  const [pin] = markersOn(map);

  if (!pin) {
    throw new Error('the map has no pin');
  }

  return pin;
}

/** The street basemap both pickers share, so a picked point is seen on a street it can be named by. */
function expectStreetBasemap(map: L.Map) {
  const host = map.getContainer();

  expect(host.querySelector('.leaflet-tile')?.getAttribute('src')).toContain(
    'tile.openstreetmap.org',
  );
  expect(host.querySelector('.leaflet-control-attribution')).not.toBeNull();
}

/** Leaflet's own arithmetic leaves a reported view a hair off the one it was asked for. */
function expectView(view: MapViewValue | undefined, expected: MapViewValue) {
  expect(view?.lat).toBeCloseTo(expected.lat, 6);
  expect(view?.lng).toBeCloseTo(expected.lng, 6);
  expect(view?.zoom).toBe(expected.zoom);
}

/** A pin taken hold of and dragged to `to`, still held: Leaflet reports every step it takes. */
function dragTo(
  marker: L.Marker,
  via: [number, number][],
  to: [number, number],
) {
  marker.fire('dragstart');

  via.forEach((step) => {
    marker.setLatLng(step);
    marker.fire('drag');
  });

  marker.setLatLng(to);
  marker.fire('drag');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('the location picker’s map', () => {
  let picked: { lat: number; lng: number }[];

  function pickerElement({
    value,
  }: {
    value: PickedPoint | null;
  }): ReactElement {
    return createElement(LocationPickerCanvas, {
      value,
      startView: EVENT_VIEW,
      onPick: (point: { lat: number; lng: number }) => picked.push(point),
    });
  }

  beforeEach(() => {
    picked = [];
  });

  it('opens on the event’s view when no point is picked yet', async () => {
    await renderPanel(pickerElement({ value: null }));

    const map = onlyMap();

    expect(map.getZoom()).toBe(EVENT_VIEW.zoom);
    expect(
      map
        .latLngToContainerPoint(EVENT_VIEW.center)
        .distanceTo(L.point(MAP_WIDTH / 2, MAP_HEIGHT / 2)),
    ).toBeLessThan(1);
    expect(markersOn(map)).toEqual([]);
    expect(picked).toEqual([]);
  });

  it('opens on a point already picked, at street zoom, with the pin on it', async () => {
    await renderPanel(
      pickerElement({ value: { lat: 23.7, lng: 121.1, source: 'seed' } }),
    );

    const map = onlyMap();
    const pin = pinOf(map);

    expectStreetBasemap(map);
    expect(map.getZoom()).toBe(PICKED_ZOOM);
    expect(
      map
        .latLngToContainerPoint(L.latLng(23.7, 121.1))
        .distanceTo(L.point(MAP_WIDTH / 2, MAP_HEIGHT / 2)),
    ).toBeLessThan(1);
    expect(pin.getLatLng()).toEqual(L.latLng(23.7, 121.1));
    // Showing the point on the map is not picking it: the page already knows where it is.
    expect(picked).toEqual([]);
  });

  it('takes a tap on the map as the point picked there', async () => {
    await renderPanel(pickerElement({ value: null }));

    onlyMap().fire('click', { latlng: L.latLng(23.65, 121.05) });

    expect(picked).toEqual([{ lat: 23.65, lng: 121.05 }]);
  });

  it('reports the pin once it is let go, not while it is dragged', async () => {
    await renderPanel(
      pickerElement({ value: { lat: 23.7, lng: 121.1, source: 'seed' } }),
    );

    const pin = pinOf(onlyMap());

    dragTo(pin, [[23.705, 121.105]], [23.71, 121.11]);

    expect(picked).toEqual([]);

    pin.fire('dragend');

    expect(picked).toEqual([{ lat: 23.71, lng: 121.11 }]);
  });

  it('moves the view to a point brought in, and stays where it is for one placed by hand', async () => {
    await renderPanel(
      pickerElement({ value: { lat: 23.7, lng: 121.1, source: 'seed' } }),
    );

    const map = onlyMap();
    const atSeed = map.getCenter();

    // Put on this map: the pin moves, the view stays where it was looking.
    await rerender(
      pickerElement({ value: { lat: 23.75, lng: 121.15, source: 'manual' } }),
    );
    await settle();

    expect(pinOf(map).getLatLng()).toEqual(L.latLng(23.75, 121.15));
    expect(map.getCenter()).toEqual(atSeed);
    expect(map.getZoom()).toBe(PICKED_ZOOM);

    // Brought from the main map: the view goes to it.
    await rerender(
      pickerElement({ value: { lat: 23.75, lng: 121.15, source: 'seed' } }),
    );
    await settle();

    expect(
      map
        .latLngToContainerPoint(L.latLng(23.75, 121.15))
        .distanceTo(L.point(MAP_WIDTH / 2, MAP_HEIGHT / 2)),
    ).toBeLessThan(1);
    expect(picked).toEqual([]);
  });

  it('leaves no observer running once it unmounts, and its map off the page', async () => {
    await renderPanel(pickerElement({ value: null }));

    const observer = resizeObservers.at(-1);
    const host = onlyMap().getContainer();

    await act(async () => root.unmount());

    expect(observer?.observed).toEqual([host]);
    expect(observer?.disconnected).toBe(true);
    expect(container.querySelector('.leaflet-container')).toBeNull();
  });
});

describe('the view picker’s map', () => {
  let moved: MapViewValue[];

  const INITIAL: MapViewValue = { lat: 23.6, lng: 120.9, zoom: 8 };

  function pickerView({
    editable,
    request = null,
  }: {
    editable: boolean;
    request?: MapViewPickerRequest | null;
  }): ReactElement {
    return createElement(MapViewPickerCanvas, {
      label: '事件地圖視角',
      initial: INITIAL,
      editable,
      request,
      onMove: (view: MapViewValue) => moved.push(view),
    });
  }

  beforeEach(() => {
    moved = [];
  });

  it('reports the view it opens on, once', async () => {
    await renderPanel(pickerView({ editable: true }));

    expect(moved).toHaveLength(1);
    expectView(moved[0], INITIAL);

    const map = onlyMap();

    expect(map.getZoom()).toBe(INITIAL.zoom);
    expectStreetBasemap(map);
  });

  it('reports a move, with a centre panned past 180° wrapped back', async () => {
    await renderPanel(pickerView({ editable: true }));

    const map = onlyMap();

    await rerender(
      pickerView({
        editable: true,
        request: { view: { lat: 23.9, lng: 181, zoom: 11 }, id: 1 },
      }),
    );
    await settle();

    // The backend holds a longitude to -180..180, so that is what goes up.
    expectView(moved.at(-1), { lat: 23.9, lng: -179, zoom: 11 });
    expect(map.getCenter().lng).toBeCloseTo(181, 6);
  });

  it('is a picture and no tab stop when it cannot be moved', async () => {
    await renderPanel(pickerView({ editable: false }));

    const map = onlyMap();
    const host = map.getContainer();

    expect(host.getAttribute('tabindex')).toBeNull();
    expect(
      container.querySelector('[role="img"]')?.getAttribute('aria-label'),
    ).toBe('事件地圖視角');
    // Nothing zooms it either, and no gesture moves it.
    expect(host.querySelector('.leaflet-control-zoom')).toBeNull();
    expect(map.dragging.enabled()).toBe(false);
    expect(map.scrollWheelZoom.enabled()).toBe(false);
    expect(map.doubleClickZoom.enabled()).toBe(false);
    expect(map.touchZoom.enabled()).toBe(false);
    expect(map.keyboard.enabled()).toBe(false);
    expect(moved).toHaveLength(1);
    expectView(moved[0], INITIAL);
  });

  it('can be moved once the viewer may change it', async () => {
    await renderPanel(pickerView({ editable: false }));

    const map = onlyMap();
    const host = map.getContainer();

    await rerender(pickerView({ editable: true }));

    expect(host.querySelector('.leaflet-control-zoom')).not.toBeNull();
    expect(host.getAttribute('tabindex')).toBe('0');
    expect(container.querySelector('[role="application"]')).not.toBeNull();
    expect(map.dragging.enabled()).toBe(true);
    expect(map.keyboard.enabled()).toBe(true);

    // And off again, when the viewer may not change it after all.
    await rerender(pickerView({ editable: false }));

    expect(host.querySelector('.leaflet-control-zoom')).toBeNull();
    expect(host.getAttribute('tabindex')).toBeNull();
    expect(map.dragging.enabled()).toBe(false);
  });

  it('takes a view it is asked for, including the same one again', async () => {
    const asked: MapViewValue = { lat: 24.2, lng: 120.5, zoom: 11 };

    await renderPanel(pickerView({ editable: false }));

    const map = onlyMap();

    await rerender(
      pickerView({ editable: false, request: { view: asked, id: 1 } }),
    );
    await settle();

    expect(map.getZoom()).toBe(asked.zoom);
    expect(
      map
        .latLngToContainerPoint(L.latLng(asked.lat, asked.lng))
        .distanceTo(L.point(MAP_WIDTH / 2, MAP_HEIGHT / 2)),
    ).toBeLessThan(1);
    expectView(moved.at(-1), asked);

    // Moved elsewhere in the meantime; the same view asked for again, with a new id, brings it back.
    await act(async () => {
      map.setView([24.4, 119.9], 9, { animate: false });
    });
    await settle();

    expect(map.getZoom()).toBe(9);

    await rerender(
      pickerView({ editable: false, request: { view: asked, id: 2 } }),
    );
    await settle();

    expect(map.getZoom()).toBe(asked.zoom);
    expectView(moved.at(-1), asked);
  });

  it('leaves no observer running once it unmounts, and its map off the page', async () => {
    await renderPanel(pickerView({ editable: true }));

    const observer = resizeObservers.at(-1);
    const host = onlyMap().getContainer();

    await act(async () => root.unmount());

    expect(observer?.observed).toEqual([host]);
    expect(observer?.disconnected).toBe(true);
    expect(container.querySelector('.leaflet-container')).toBeNull();
  });
});
