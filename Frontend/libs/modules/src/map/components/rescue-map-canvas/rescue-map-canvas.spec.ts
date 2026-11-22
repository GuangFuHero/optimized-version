// @vitest-environment jsdom
import L from 'leaflet';
import { act, createElement, StrictMode, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { designTokens } from '@rescue-frontend/ui';

import { BASE_LAYER_CONFIG } from '../../constants';
import type {
  RescueMapBoundingBox,
  RescueMapControllerValue,
  RescueMapDraftArea,
  RescueMapDraftPoint,
  RescueMapEditArea,
  RescueMapMarkerItem,
} from '../../types';
import { RescueMapCanvas } from '.';

/** A controller method the canvas reads and never calls, or an observer method jsdom never uses. */
const doNothing = () => undefined;

/** The size Leaflet measures its container at. jsdom lays nothing out, so the test says. */
const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

/**
 * jsdom has no `ResizeObserver`, and the canvas watches its host for resizes. It measures nothing
 * here: the test only needs the observer to be built, to be observed and to be disconnected again.
 */
const resizeObservers: ResizeObserverStub[] = [];

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

/** jsdom's own getters, put back after the tests that need a measured map container. */
let unmeasured: (() => void) | null = null;

beforeAll(() => {
  const prototype = HTMLElement.prototype;
  const original = {
    clientWidth: Object.getOwnPropertyDescriptor(prototype, 'clientWidth'),
    clientHeight: Object.getOwnPropertyDescriptor(prototype, 'clientHeight'),
  };

  // The map's own host is the element Leaflet lays its panes in, and it wears
  // `leaflet-container` from the moment the map is built.
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
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom draws no SVG box, so Leaflet decides it cannot draw SVG at all (`L.Browser.svg`), and a
  // polygon would come out with no renderer. jsdom's DOM takes the path elements the SVG renderer
  // makes, so the map is told what a browser would have told it.
  Object.assign(L.Browser, { svg: true });
  resizeObservers.length = 0;
});

afterAll(() => {
  unmeasured?.();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const CENTER: [number, number] = [23.89, 121];
const INITIAL_VIEW = { center: CENTER, zoom: 13 };

const OUTLINE: [number, number][] = [
  [23.9, 120.99],
  [23.9, 121.01],
  [23.88, 121.01],
  [23.88, 120.99],
];

const POINT: RescueMapDraftPoint = { lat: 23.89, lng: 121 };

/** What the canvas reported back, in the order it said it. */
interface Reported {
  viewports: {
    center: [number, number];
    zoom: number;
    bbox: RescueMapBoundingBox;
  }[];
  mapClicks: [number, number][];
  draftPoints: (RescueMapDraftPoint | null)[];
  editPoints: [number, number][][];
}

function createController({
  reported,
  markers = [],
}: {
  reported: Reported;
  markers?: RescueMapMarkerItem[];
}): RescueMapControllerValue {
  return {
    baseLayer: 'osm-direct',
    setBaseLayer: doNothing,
    setDataType: doNothing,
    subDataTypes: [],
    toggleSubDataType: doNothing,
    enabledOverlayLayers: [],
    toggleOverlayLayer: doNothing,
    setSelectedMarkerId: doNothing,
    setViewportState: (next) => {
      reported.viewports.push({
        center: [...next.center],
        zoom: next.zoom,
        bbox: [...next.bbox],
      });
    },
    layerPanelOpen: false,
    openLayerPanel: doNothing,
    closeLayerPanel: doNothing,
    markers,
    closureAreas: [],
    publicZones: [],
    overlayLayerMeta: {},
    tileLayer: BASE_LAYER_CONFIG['osm-direct'],
    initialView: INITIAL_VIEW,
  };
}

interface CanvasProps {
  controller: RescueMapControllerValue;
  draftArea?: RescueMapDraftArea | null;
  editArea?: RescueMapEditArea | null;
  draftPoint?: RescueMapDraftPoint | null;
  draftPointAction?: ReactElement | null;
  onDraftPointChange?: (point: RescueMapDraftPoint | null) => void;
  onMapClick?: (position: [number, number]) => void;
  layoutKey?: string;
}

let container: HTMLDivElement;
let root: Root;
let reported: Reported;
let maps: L.Map[];

function elementFor(props: CanvasProps) {
  return createElement(RescueMapCanvas, {
    locationCells: [],
    layoutKey: props.layoutKey ?? 'spec',
    showScale: true,
    onMarkerClick: doNothing,
    onMapReady: (map: L.Map) => {
      maps.push(map);
    },
    ...props,
  });
}

async function render(props: CanvasProps) {
  await act(async () => root.render(elementFor(props)));
  await settle();
}

function rerender(props: CanvasProps) {
  return act(async () => root.render(elementFor(props)));
}

/** A frame for Leaflet's `requestAnimationFrame` measurement, and a turn for the cluster module. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

function remountInAFreshContainer() {
  container.remove();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
}

/** The markers of one icon class, in the order the canvas made them. */
function markersOf(map: L.Map, className: string): L.Marker[] {
  const found: L.Marker[] = [];

  map.eachLayer((layer) => {
    if (
      layer instanceof L.Marker &&
      layer.options.icon?.options.className === className
    ) {
      found.push(layer);
    }
  });

  return found;
}

function iconSizeOf(marker: L.Marker): L.Point {
  return L.point(marker.options.icon?.options.iconSize ?? [0, 0]);
}

function crosshairOf(map: L.Map): L.Marker {
  const crosshair = markersOf(map, '').find(
    (marker) => marker.options.title === '拖曳可移動位置',
  );

  if (!crosshair) {
    throw new Error('the map has no crosshair');
  }

  return crosshair;
}

function bubbleOf(map: L.Map): L.Marker {
  const bubble = markersOf(map, '').find((marker) =>
    iconSizeOf(marker).equals(L.point(0, 0)),
  );

  if (!bubble) {
    throw new Error('the crosshair has no bubble');
  }

  return bubble;
}

/** The dashed outline drawn while a boundary is being changed, or an area is being drawn. */
function boundaryOutline(map: L.Map): L.Polygon | undefined {
  let outline: L.Polygon | undefined;

  map.eachLayer((layer) => {
    if (layer instanceof L.Polygon && layer.options.dashArray === '6 6') {
      outline = layer;
    }
  });

  return outline;
}

function drawnBoundary(map: L.Map): L.Polygon {
  const outline = boundaryOutline(map);

  if (!outline) {
    throw new Error('the map draws no boundary');
  }

  return outline;
}

/** A line Leaflet closed into a polygon, once it has three corners. */
function closedOutline(line: L.Polyline | undefined): L.Polygon {
  if (!(line instanceof L.Polygon)) {
    throw new Error('the outline is not closed');
  }

  return line;
}

/** A polygon's outer ring, corners in the order they were given. */
function outerRing(polygon: L.Polygon): L.LatLng[] {
  const ring = polygon.getLatLngs()[0];

  if (!Array.isArray(ring)) {
    throw new Error('the polygon has no outer ring');
  }

  return ring.filter(
    (corner): corner is L.LatLng => corner instanceof L.LatLng,
  );
}

/** A handle taken hold of and dragged to `to`, still held: Leaflet reports every step it takes. */
function leadHandleTo(
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
  reported = { viewports: [], mapClicks: [], draftPoints: [], editPoints: [] };
  maps = [];
});

describe('the map the canvas builds', () => {
  it('builds one Leaflet map in its own host and hands it over', async () => {
    await render({ controller: createController({ reported }) });

    expect(maps).toHaveLength(1);

    const map = maps[0];
    const host = map.getContainer();

    expect(host.isConnected).toBe(true);
    expect(host.className).toContain('leaflet-container');
    // The centre it was given sits in the middle of the map, give or take Leaflet's whole pixels.
    expect(
      map
        .latLngToContainerPoint(L.latLng(CENTER[0], CENTER[1]))
        .distanceTo(L.point(MAP_WIDTH / 2, MAP_HEIGHT / 2)),
    ).toBeLessThan(1);
    expect(map.getZoom()).toBe(INITIAL_VIEW.zoom);
    expect(map.getSize()).toEqual(L.point(MAP_WIDTH, MAP_HEIGHT));
    expect(host.querySelector('.leaflet-control-zoom')).not.toBeNull();
    expect(host.querySelector('.leaflet-control-scale')).not.toBeNull();

    // Where it opened is written back, so the page's own map state starts from what is on screen.
    const firstView = reported.viewports.at(-1);

    expect(firstView?.zoom).toBe(INITIAL_VIEW.zoom);
    // Bit-for-bit centring is not Leaflet's: it works in whole pixels, a fraction of a degree here.
    expect(firstView?.center[0]).toBeCloseTo(CENTER[0], 3);
    expect(firstView?.center[1]).toBeCloseTo(CENTER[1], 3);

    const [west, south, east, north] = firstView?.bbox ?? [0, 0, 0, 0];

    expect(west).toBeLessThan(CENTER[1]);
    expect(east).toBeGreaterThan(CENTER[1]);
    expect(south).toBeLessThan(CENTER[0]);
    expect(north).toBeGreaterThan(CENTER[0]);
  });

  it('leaves nothing running once it unmounts', async () => {
    await render({ controller: createController({ reported }) });

    const map = maps[0];
    const host = map.getContainer();
    const observer = resizeObservers.at(-1);

    await act(async () => root.unmount());

    expect(observer?.observed).toEqual([host]);
    expect(observer?.disconnected).toBe(true);
    expect(host.isConnected).toBe(false);
    // `map.remove()` takes the map pane, and every layer pane inside it, off the container.
    expect(host.querySelector('.leaflet-map-pane')).toBeNull();
    expect(host.querySelector('.leaflet-tile-pane')).toBeNull();

    const viewports = reported.viewports.length;

    // Nothing the map fires reaches the page after it is gone, and its debounced write never lands.
    map.fire('click', { latlng: L.latLng(23.5, 121.5) });
    map.fire('zoomend');
    map.fire('moveend');
    map.fire('movestart');

    await settle();

    expect(reported.viewports).toHaveLength(viewports);
    expect(reported.mapClicks).toEqual([]);
    expect(reported.draftPoints).toEqual([]);
  });

  it('keeps one set of layers and controls when React replays effects', async () => {
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          elementFor({ controller: createController({ reported }) }),
        ),
      );
    });
    await settle();

    expect(container.querySelectorAll('.leaflet-control-zoom')).toHaveLength(1);
    expect(container.querySelectorAll('.leaflet-control-scale')).toHaveLength(
      1,
    );
    expect(
      container.querySelectorAll('.leaflet-tile-pane .leaflet-layer'),
    ).toHaveLength(1);
  });

  it('builds a fresh map when it is mounted again, with the old one gone', async () => {
    const props = { controller: createController({ reported }) };

    await render(props);
    const first = maps[0];
    const firstHost = first.getContainer();

    await act(async () => root.unmount());
    remountInAFreshContainer();
    await render(props);

    expect(maps).toHaveLength(2);
    expect(maps[1]).not.toBe(first);
    expect(firstHost.isConnected).toBe(false);
    expect(firstHost.querySelector('.leaflet-map-pane')).toBeNull();
    expect(maps[1].getContainer().isConnected).toBe(true);
    expect(container.querySelectorAll('.leaflet-container')).toHaveLength(1);
    expect(container.querySelectorAll('.leaflet-control-zoom')).toHaveLength(1);
  });

  it('keeps the map, and only measures it again, when the layout key changes', async () => {
    const props = {
      controller: createController({ reported }),
      layoutKey: 'wide',
    };

    await render(props);

    const map = maps[0];
    const host = map.getContainer();

    await rerender({ ...props, layoutKey: 'narrow' });
    await settle();

    expect(maps).toHaveLength(1);
    expect(map.getContainer()).toBe(host);
    expect(host.isConnected).toBe(true);
    expect(resizeObservers).toHaveLength(1);
  });

  it('shuts down cleanly when it is taken away before the cluster module arrives', async () => {
    await act(async () => {
      root.render(elementFor({ controller: createController({ reported }) }));
      root.unmount();
    });

    await settle();

    expect(container.querySelector('.leaflet-container')).toBeNull();
  });
});

describe('drawing an area', () => {
  const FIRST_TWO: [number, number][] = [
    [23.9, 120.99],
    [23.9, 121.01],
  ];
  const FIRST_THREE: [number, number][] = [...FIRST_TWO, [23.88, 121.01]];

  it.each([
    {
      title:
        'finishes a valid outline when the repeat click lands a pixel away',
      offset: 1,
      delay: 100,
      shouldFinish: true,
    },
    {
      title: 'adds a vertex when the next click lands seven pixels away',
      offset: 7,
      delay: 100,
      shouldFinish: false,
    },
    {
      title: 'adds a nearby vertex when the next click arrives after 500 ms',
      offset: 1,
      delay: 500,
      shouldFinish: false,
    },
  ])('$title', async ({ offset, delay, shouldFinish }) => {
    const changes: [number, number][][] = [];
    const onFinish = vi.fn();
    const drawing = {
      onChange: (points: [number, number][]) => changes.push(points),
      onFinish,
    };
    const controller = createController({ reported });
    await render({
      controller,
      draftArea: { points: FIRST_TWO, invalid: false, drawing },
    });

    const map = maps[0];
    const last = L.latLng(FIRST_THREE[2]);
    const nearLast = map.containerPointToLatLng(
      map.latLngToContainerPoint(last).add([offset, 0]),
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const firstClickAt = Date.now();
      map.fire('click', { latlng: last });
      await rerender({
        controller,
        draftArea: { points: changes[0], invalid: false, drawing },
      });
      vi.setSystemTime(firstClickAt + delay);
      map.fire('click', { latlng: nearLast });
    } finally {
      vi.useRealTimers();
    }

    expect(changes).toEqual(
      shouldFinish
        ? [FIRST_THREE]
        : [FIRST_THREE, [...FIRST_THREE, [nearLast.lat, nearLast.lng]]],
    );
    expect(onFinish).toHaveBeenCalledTimes(shouldFinish ? 1 : 0);
  });

  /** Everything drawn for the area being drawn: the line through the corners, and the corners. */
  function drawnPaths(map: L.Map): {
    line: L.Polyline | undefined;
    corners: number;
  } {
    let line: L.Polyline | undefined;
    let corners = 0;

    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline) {
        line = layer;
        return;
      }

      if (layer instanceof L.CircleMarker) {
        corners += 1;
      }
    });

    return { line, corners };
  }

  it('draws a dashed line through two corners, a closed area from three, red while it crosses itself', async () => {
    const props = {
      controller: createController({ reported }),
      draftArea: { points: FIRST_TWO, invalid: false },
    };

    await render(props);

    const map = maps[0];
    const firstTwo = drawnPaths(map);

    expect(firstTwo.line).toBeInstanceOf(L.Polyline);
    expect(firstTwo.line).not.toBeInstanceOf(L.Polygon);
    expect(firstTwo.line?.options.dashArray).toBe('6 6');
    expect(firstTwo.line?.options.color).toBe(
      designTokens.color.fg.neutral.default,
    );
    // A dot on each corner, so the person drawing sees where a tap went.
    expect(firstTwo.corners).toBe(2);

    await rerender({
      ...props,
      draftArea: { points: FIRST_THREE, invalid: false },
    });

    const fromThree = drawnPaths(map);

    expect(maps).toHaveLength(1);
    expect(fromThree.line).toBeInstanceOf(L.Polygon);
    expect(outerRing(closedOutline(fromThree.line))).toHaveLength(3);
    expect(fromThree.corners).toBe(3);

    // Crossing itself: the same dashed line, in the colour that says it cannot be finished.
    await rerender({
      ...props,
      draftArea: { points: FIRST_THREE, invalid: true },
    });

    expect(drawnPaths(map).line?.options.color).toBe(
      designTokens.color.bg.danger.default,
    );
  });
});

describe('changing a boundary', () => {
  function editAreaOf(invalid = false): RescueMapEditArea {
    return {
      points: OUTLINE,
      invalid,
      onChange: (next) => {
        reported.editPoints.push(next);
      },
    };
  }

  it('reports a corner once, when it is let go, not while it is held', async () => {
    await render({
      controller: createController({ reported }),
      editArea: editAreaOf(),
    });

    const map = maps[0];
    const corners = markersOf(map, 'rescue-map-edit-corner');

    expect(corners).toHaveLength(OUTLINE.length);

    leadHandleTo(
      corners[0],
      [
        [23.905, 120.99],
        [23.907, 120.992],
      ],
      [23.91, 120.995],
    );

    // Nothing is reported on the way: the corners are not made again under the hand that holds one.
    expect(reported.editPoints).toEqual([]);

    // The outline followed the handle as it went.
    expect(outerRing(drawnBoundary(map))[0]).toEqual(L.latLng(23.91, 120.995));

    corners[0].fire('dragend');

    expect(reported.editPoints).toEqual([
      [[23.91, 120.995], OUTLINE[1], OUTLINE[2], OUTLINE[3]],
    ]);
  });

  it('adds a corner where the plus was clicked, between the two it sat between', async () => {
    await render({
      controller: createController({ reported }),
      editArea: editAreaOf(),
    });

    const plusMarks = markersOf(maps[0], 'rescue-map-edit-midpoint');

    // One between each two corners, the last between the last and the first.
    expect(plusMarks).toHaveLength(OUTLINE.length);
    expect(plusMarks[0].getLatLng()).toEqual(
      L.latLng(
        (OUTLINE[0][0] + OUTLINE[1][0]) / 2,
        (OUTLINE[0][1] + OUTLINE[1][1]) / 2,
      ),
    );
    expect(plusMarks[3].getLatLng()).toEqual(
      L.latLng(
        (OUTLINE[3][0] + OUTLINE[0][0]) / 2,
        (OUTLINE[3][1] + OUTLINE[0][1]) / 2,
      ),
    );

    plusMarks[1].fire('click');

    expect(reported.editPoints).toEqual([
      [
        OUTLINE[0],
        OUTLINE[1],
        [
          (OUTLINE[1][0] + OUTLINE[2][0]) / 2,
          (OUTLINE[1][1] + OUTLINE[2][1]) / 2,
        ],
        OUTLINE[2],
        OUTLINE[3],
      ],
    ]);
  });

  it('takes a corner away when it is clicked, but never leaves fewer than three', async () => {
    const props = {
      controller: createController({ reported }),
      editArea: editAreaOf(),
    };

    await render(props);

    const map = maps[0];

    markersOf(map, 'rescue-map-edit-corner')[1].fire('click');

    expect(reported.editPoints).toEqual([[OUTLINE[0], OUTLINE[2], OUTLINE[3]]]);

    // The page redraws with the three corners left: from here the last one cannot go.
    await rerender({
      controller: props.controller,
      editArea: {
        points: [OUTLINE[0], OUTLINE[2], OUTLINE[3]],
        invalid: false,
        onChange: (next) => {
          reported.editPoints.push(next);
        },
      },
    });

    // The same map, with the corners redrawn on it: changing a boundary never builds a second one.
    expect(maps).toHaveLength(1);

    const remaining = markersOf(map, 'rescue-map-edit-corner');

    expect(remaining).toHaveLength(3);

    remaining.forEach((corner) => corner.fire('click'));

    expect(reported.editPoints).toHaveLength(1);
  });

  it('ignores the click a drag ends with, and takes the next one', async () => {
    await render({
      controller: createController({ reported }),
      editArea: editAreaOf(),
    });

    const corner = markersOf(maps[0], 'rescue-map-edit-corner')[0];

    leadHandleTo(corner, [[23.905, 120.99]], [23.91, 120.995]);
    corner.fire('dragend');
    // Leaflet sends the click straight after the drag is let go: it is not a click on the corner.
    corner.fire('click');

    expect(reported.editPoints).toHaveLength(1);

    // A moment later the same click is a click on the corner, and takes it away.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    corner.fire('click');

    expect(reported.editPoints).toHaveLength(2);
    expect(reported.editPoints[1]).toHaveLength(3);
  });

  it('draws the boundary red while it crosses itself', async () => {
    const controller = createController({ reported });
    await render({
      controller,
      editArea: editAreaOf(),
    });

    const outline = drawnBoundary(maps[0]);

    await render({ controller, editArea: editAreaOf(true) });

    expect(drawnBoundary(maps[0])).toBe(outline);
    expect(outline.options.color).toBe(designTokens.color.bg.danger.default);
    expect(outline.options.fill).toBe(true);
    expect(outerRing(outline)).toHaveLength(OUTLINE.length);
  });
});

describe('a point being picked', () => {
  it('floats the bubble on the crosshair and moves it along', async () => {
    await render({
      controller: createController({ reported }),
      draftPoint: POINT,
      draftPointAction: createElement('button', null, '清除'),
    });

    const map = maps[0];
    const crosshair = crosshairOf(map);
    const bubble = bubbleOf(map);

    expect(crosshair.getLatLng()).toEqual(L.latLng(POINT.lat, POINT.lng));
    expect(crosshair.options.draggable).toBe(true);
    expect(bubble.getLatLng()).toEqual(L.latLng(POINT.lat, POINT.lng));

    // The bubble's content is portalled into its own icon element, which rides on the map with it.
    expect(bubble.getElement()?.querySelector('button')?.textContent).toBe(
      '清除',
    );

    crosshair.setLatLng([23.88, 121.02]);
    crosshair.fire('drag');

    expect(bubble.getLatLng()).toEqual(L.latLng(23.88, 121.02));
  });

  it('keeps a tap on the bubble off the map, so it does not pick a new point', async () => {
    await render({
      controller: createController({ reported }),
      draftPoint: POINT,
      draftPointAction: createElement('button', null, '清除'),
      onMapClick: (position) => reported.mapClicks.push(position),
    });

    const map = maps[0];
    const action = bubbleOf(map).getElement()?.querySelector('button');

    if (!action) {
      throw new Error('the bubble holds no action');
    }

    // A tap on the map itself does reach it, so the check below is not passing for want of a listener.
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        );
    });

    expect(reported.mapClicks).toHaveLength(1);

    await act(async () => {
      action.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });

    expect(reported.mapClicks).toHaveLength(1);
  });

  it('does not take the crosshair’s own autopan for the map being moved', async () => {
    await render({
      controller: createController({ reported }),
      draftPoint: POINT,
      onDraftPointChange: (point) => reported.draftPoints.push(point),
    });

    const map = maps[0];
    const crosshair = crosshairOf(map);

    // Held, and autopanned by the map: the point stays where it was put.
    crosshair.fire('dragstart');
    map.fire('movestart');
    map.fire('zoomstart');

    expect(reported.draftPoints).toEqual([]);

    crosshair.setLatLng([23.9, 121.03]);
    crosshair.fire('drag');
    crosshair.fire('dragend');

    expect(reported.draftPoints).toEqual([{ lat: 23.9, lng: 121.03 }]);

    // Now the map is moved by hand: the bubble would point elsewhere, so the point is let go.
    map.fire('movestart');

    expect(reported.draftPoints).toEqual([{ lat: 23.9, lng: 121.03 }, null]);
  });

  it('puts the crosshair and its bubble away when the point is let go', async () => {
    const props = {
      controller: createController({ reported }),
      draftPoint: POINT,
      draftPointAction: createElement('button', null, '清除'),
    };

    await render(props);

    const map = maps[0];

    expect(markersOf(map, '')).toHaveLength(2);

    await rerender({ ...props, draftPoint: null });

    expect(markersOf(map, '')).toHaveLength(0);
    expect(map.getContainer().querySelector('.leaflet-marker-icon')).toBeNull();
    expect(map.getContainer().querySelector('button')).toBeNull();
  });

  it('reports a tap on the map, so a corner or a point can go there', async () => {
    await render({
      controller: createController({ reported }),
      onMapClick: (position) => reported.mapClicks.push(position),
    });

    maps[0].fire('click', { latlng: L.latLng(23.9, 121.02) });

    expect(reported.mapClicks).toEqual([[23.9, 121.02]]);
  });
});

describe('markers', () => {
  const marker: RescueMapMarkerItem = {
    id: 'ticket-1',
    title: '清理淤泥',
    subtitle: '',
    position: [23.89, 121],
    label: '任務',
    variant: 'urgent-ticket',
    detailType: 'ticket',
  };

  it('pins a marker once, and leaves it alone when nothing about it changed', async () => {
    const props = {
      controller: createController({ reported, markers: [marker] }),
    };

    await render(props);

    const map = maps[0];
    const pinned = map.getContainer().querySelectorAll('.leaflet-marker-icon');

    expect(pinned).toHaveLength(1);

    // The same marker again: no marker is made again, so nothing flickers under the hand.
    await rerender(props);

    expect(maps).toHaveLength(1);
    expect(
      map.getContainer().querySelectorAll('.leaflet-marker-icon'),
    ).toHaveLength(1);
    expect(map.getContainer().querySelector('.leaflet-marker-icon')).toBe(
      pinned[0],
    );
  });

  it('takes a marker off when it is no longer among the markers', async () => {
    const props = {
      controller: createController({ reported, markers: [marker] }),
    };

    await render(props);

    const map = maps[0];

    expect(
      map.getContainer().querySelectorAll('.leaflet-marker-icon'),
    ).toHaveLength(1);

    await rerender({ controller: createController({ reported, markers: [] }) });

    expect(maps).toHaveLength(1);
    expect(
      map.getContainer().querySelectorAll('.leaflet-marker-icon'),
    ).toHaveLength(0);
  });
});
