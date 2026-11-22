// SPDX-License-Identifier: GPL-3.0-only
import type {
  FeatureGroup,
  Map as LeafletMap,
  Marker,
  PathOptions,
  Polygon,
  PopupOptions,
} from 'leaflet';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref,
} from 'react';
import {
  polygonsLargestFirst,
  type PolygonRings,
  type PolygonVertex,
} from './geometry.ts';
import { placeLabels, type ScreenBox } from './labels.ts';
import { useMapRuntime } from './map-container.tsx';

export interface PolygonItem {
  id: string;
  /** One set of rings per polygon, with the outer ring first. */
  polygons: readonly PolygonRings[];
}

export interface PolygonLabel {
  text: string;
  title?: string;
  priority?: number;
  className?: string;
  anchorClassName?: string;
  popup?: { content: string | HTMLElement; options?: PopupOptions };
}

export interface PolygonLayerHandle {
  relayout: () => void;
}

export interface PolygonLayerProps<Item extends PolygonItem> {
  items: readonly Item[];
  getStyle?: (item: Item) => PathOptions;
  getLabel?: (item: Item) => PolygonLabel | undefined;
  /** Rebuild an area only when this key changes, including geometry and label data. */
  getRevision?: (item: Item) => string | number;
  /** Select marker or overlay elements that labels must leave clear. */
  obstacleSelector?: string;
  ref?: Ref<PolygonLayerHandle>;
}

interface MapLabel {
  polygon: Polygon;
  marker: Marker;
  element: HTMLElement;
  priority?: number;
}

interface PolygonEntry<Item> {
  group: FeatureGroup;
  labels: MapLabel[];
  revision: Item | string | number;
}

function isCovered(host: HTMLElement, { left, top }: DOMRect, box: ScreenBox) {
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  return [
    [box.left, box.top],
    [box.right, box.top],
    [box.left, box.bottom],
    [box.right, box.bottom],
    [centerX, centerY],
  ].some(([x, y]) => {
    const element = host.ownerDocument.elementFromPoint(left + x, top + y);
    return (
      !element ||
      !host.contains(element) ||
      Boolean(element.closest('.leaflet-control'))
    );
  });
}

function layoutLabels(
  map: LeafletMap,
  leaflet: typeof import('leaflet'),
  labels: readonly MapLabel[],
  obstacleSelector: string,
) {
  const host = map.getContainer();
  if (!labels.length || !host.offsetWidth) return;

  // Read all sizes before moving any label.
  for (const { element } of labels) element.style.display = '';
  const sizes = labels.map(({ element }) => ({
    width: element.offsetWidth,
    height: element.offsetHeight,
  }));
  const origin = host.getBoundingClientRect();
  const anchors = new Set(labels.map(({ marker }) => marker.getElement()));
  const obstacles = Array.from(
    host.querySelectorAll<HTMLElement>(obstacleSelector),
  )
    .filter((el) => !anchors.has(el))
    .map((el) => el.getBoundingClientRect())
    .filter(({ width, height }) => width > 0 && height > 0)
    .map(({ left, top, right, bottom }) => ({
      left: left - origin.left,
      top: top - origin.top,
      right: right - origin.left,
      bottom: bottom - origin.top,
    }));
  const spots = placeLabels(
    labels.map(({ polygon, priority }, index) => {
      const bounds = polygon.getBounds();
      const topLeft = map.latLngToContainerPoint(bounds.getNorthWest());
      const bottomRight = map.latLngToContainerPoint(bounds.getSouthEast());
      return {
        priority,
        area: {
          left: topLeft.x,
          top: topLeft.y,
          right: bottomRight.x,
          bottom: bottomRight.y,
        },
        label: sizes[index],
      };
    }),
    {
      width: host.clientWidth,
      height: host.clientHeight,
      obstacles,
      isCovered: (box) => isCovered(host, origin, box),
    },
  );

  labels.forEach(({ marker, element }, index) => {
    const spot = spots[index];
    element.dataset.place = spot.place;
    if (!('x' in spot)) {
      element.style.display = 'none';
      return;
    }
    marker.setLatLng(map.containerPointToLatLng([spot.x, spot.y]));
    const popup = marker.getPopup();
    if (popup) {
      leaflet.setOptions(popup, {
        offset: leaflet.point(0, 3 - sizes[index].height / 2),
      });
    }
  });
}

export function PolygonLayer<Item extends PolygonItem>({
  items,
  getStyle,
  getLabel,
  getRevision,
  obstacleSelector = '.leaflet-marker-icon',
  ref,
}: PolygonLayerProps<Item>) {
  const { map, leaflet } = useMapRuntime();
  const layer = useRef<FeatureGroup | null>(null);
  const entries = useRef(new globalThis.Map<string, PolygonEntry<Item>>());
  const pendingLayout = useRef<(() => void) | null>(null);
  const place = useEffectEvent(() => {
    layoutLabels(
      map,
      leaflet,
      [...entries.current.values()].flatMap(({ labels }) => labels),
      obstacleSelector,
    );
  });

  useImperativeHandle(
    ref,
    () => ({
      relayout: () => pendingLayout.current?.(),
    }),
    [],
  );

  useEffect(() => {
    const overlay = leaflet.featureGroup().addTo(map);
    const records = entries.current;
    layer.current = overlay;
    let queued = false;
    let cancelled = false;
    const request = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!cancelled) place();
      });
    };
    pendingLayout.current = request;
    map.on('zoomend resize layeradd layerremove', request);

    return () => {
      cancelled = true;
      map.off('zoomend resize layeradd layerremove', request);
      overlay.remove();
      overlay.clearLayers();
      records.clear();
      layer.current = null;
      pendingLayout.current = null;
    };
  }, [leaflet, map]);

  useEffect(() => {
    const overlay = layer.current;
    if (!overlay) return;

    const records = entries.current;
    const keys = new Set(items.map(({ id }) => id));
    let changed = false;
    for (const [id, entry] of records) {
      if (!keys.has(id)) {
        overlay.removeLayer(entry.group);
        records.delete(id);
      }
    }

    for (const item of items) {
      const revision = getRevision?.(item) ?? item;
      const previous = records.get(item.id);
      if (previous?.revision === revision) continue;

      const group = previous?.group ?? leaflet.featureGroup();
      group.clearLayers();
      const labels: MapLabel[] = [];
      const label = getLabel?.(item);
      const options = { interactive: false, ...getStyle?.(item) };
      for (const rings of item.polygons) {
        const coordinates = rings.map((ring) =>
          ring.map(([lat, lng]): PolygonVertex => [lat, lng]),
        );
        const polygon = leaflet.polygon(coordinates, options).addTo(group);
        const bounds = polygon.getBounds();
        if (!label || !bounds.isValid()) continue;

        const element = map.getContainer().ownerDocument.createElement('div');
        element.className = label.className ?? '';
        element.textContent = label.text;
        if (label.title) element.title = label.title;
        Object.assign(element.style, {
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          whiteSpace: 'nowrap',
        });
        const marker = leaflet.marker(bounds.getCenter(), {
          icon: leaflet.divIcon({
            className: label.anchorClassName ?? '',
            html: element,
            iconSize: [0, 0],
          }),
          keyboard: false,
          zIndexOffset: -1000,
        });
        if (label.popup)
          marker.bindPopup(label.popup.content, label.popup.options);
        else marker.on('click', leaflet.DomEvent.stop);
        marker.addTo(group);
        labels.push({ polygon, marker, element, priority: label.priority });
      }
      if (!previous) group.addTo(overlay);
      records.set(item.id, { group, labels, revision });
      changed = true;
    }

    if (changed) {
      for (const { id } of polygonsLargestFirst(items))
        records.get(id)?.group.bringToFront();
    }
    pendingLayout.current?.();
  }, [getLabel, getRevision, getStyle, items, leaflet, map, obstacleSelector]);

  return null;
}
