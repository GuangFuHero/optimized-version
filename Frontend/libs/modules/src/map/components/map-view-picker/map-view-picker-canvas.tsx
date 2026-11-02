'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import {
  BASE_LAYER_CONFIG,
  MAP_VIEW_MAX_ZOOM,
  MAP_VIEW_MIN_ZOOM,
} from '../../constants';
import type { MapViewPickerRequest, MapViewValue } from './types';

/** The main map's default base layer (`use-rescue-map-controller.ts`), so its tiles are cached. */
const BASE_LAYER = BASE_LAYER_CONFIG['osm-direct'];

interface MapViewPickerCanvasProps {
  label: string;
  initial: MapViewValue;
  editable: boolean;
  onMove: (view: MapViewValue) => void;
  request: MapViewPickerRequest | null;
}

/**
 * The Leaflet part of `MapViewPicker`, loaded only in the browser. It opens on `initial`, reports the
 * view after every pan and zoom, and moves to `request` when that changes. Only `editable` lets it be
 * dragged or zoomed, and it can change once the viewer's permissions arrive.
 */
export function MapViewPickerCanvas({
  label,
  initial,
  editable,
  onMove,
  request,
}: MapViewPickerCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoomControlRef = useRef<L.Control.Zoom | null>(null);
  const onMoveRef = useRef(onMove);
  const initialRef = useRef(initial);

  onMoveRef.current = onMove;

  useEffect(() => {
    const host = hostRef.current;

    if (!host || mapRef.current) {
      return;
    }

    const start = initialRef.current;
    // The main map's zoom range, so what can be shown here is what the backend takes.
    const map = L.map(host, {
      center: [start.lat, start.lng],
      zoom: start.zoom,
      minZoom: MAP_VIEW_MIN_ZOOM,
      maxZoom: MAP_VIEW_MAX_ZOOM,
      zoomControl: false,
      boxZoom: false,
    });

    map.attributionControl.setPrefix(false);
    L.tileLayer(BASE_LAYER.url, {
      attribution: BASE_LAYER.attribution,
      maxZoom: 19,
    }).addTo(map);

    // Leaflet fires moveend after a zoom too. A centre panned past 180° is wrapped back, as the
    // backend holds a longitude to -180 to 180.
    const report = () => {
      const center = map.getCenter().wrap();
      onMoveRef.current({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      });
    };
    map.on('moveend', report);
    report();

    zoomControlRef.current = L.control.zoom({ position: 'topright' });
    mapRef.current = map;

    // The settings page lays out after the map mounts, so its first size is not the one it keeps.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      zoomControlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const zoomControl = zoomControlRef.current;

    if (!map || !zoomControl) {
      return;
    }

    const handlers = [
      map.dragging,
      map.scrollWheelZoom,
      map.doubleClickZoom,
      map.touchZoom,
      map.keyboard,
    ];

    for (const handler of handlers) {
      if (editable) {
        handler.enable();
      } else {
        handler.disable();
      }
    }

    if (editable) {
      zoomControl.addTo(map);
    } else {
      zoomControl.remove();
      // Disabling the keyboard handler leaves its tabindex, which would make the picture a tab stop
      // that does nothing. Enabling the handler again puts it back.
      map.getContainer().removeAttribute('tabindex');
    }
  }, [editable]);

  useEffect(() => {
    if (request) {
      mapRef.current?.setView(
        [request.view.lat, request.view.lng],
        request.view.zoom,
      );
    }
  }, [request]);

  // No cursor of its own: Leaflet gives a draggable map its grab cursors and takes them off with dragging.
  // Editable, Leaflet makes the container a tab stop, so it is named and says which keys move it; read
  // only, it is a picture of the view and no tab stop.
  return (
    <div
      ref={hostRef}
      role={editable ? 'application' : 'img'}
      aria-label={
        editable ? `${label}：用方向鍵移動地圖，按 + 或 − 放大縮小` : label
      }
      style={{ position: 'absolute', inset: 0 }}
    />
  );
}
