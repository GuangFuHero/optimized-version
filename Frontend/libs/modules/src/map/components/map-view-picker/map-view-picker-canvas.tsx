// SPDX-License-Identifier: GPL-3.0-only
'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect } from 'react';
import { useEventCallback } from 'usehooks-ts';
import {
  MapContainer,
  TileLayer,
  observeMapViewport,
  useMap,
} from '@rescue-frontend/leaflet';

import {
  BASE_LAYER_CONFIG,
  MAP_VIEW_MAX_ZOOM,
  MAP_VIEW_MIN_ZOOM,
} from '../../constants';
import type { MapViewPickerRequest, MapViewValue } from './types';

const BASE_LAYER = BASE_LAYER_CONFIG['osm-direct'];
const TILE_OPTIONS = { attribution: BASE_LAYER.attribution, maxZoom: 19 };

interface MapViewPickerCanvasProps {
  label: string;
  initial: MapViewValue;
  editable: boolean;
  onMove: (view: MapViewValue) => void;
  request: MapViewPickerRequest | null;
}

function MapViewControls({
  editable,
  onMove,
  request,
}: Omit<MapViewPickerCanvasProps, 'label' | 'initial'>) {
  const map = useMap();
  const moveView = useEventCallback(onMove);

  useEffect(() => {
    map.attributionControl.setPrefix(false);
    return observeMapViewport(
      map,
      ({ center: [lat, lng], zoom }) => moveView({ lat, lng, zoom }),
      { wrapLongitude: true },
    );
  }, [map, moveView]);

  useEffect(() => {
    const handlers = [
      map.dragging,
      map.scrollWheelZoom,
      map.doubleClickZoom,
      map.touchZoom,
      map.keyboard,
    ];
    for (const handler of handlers) {
      if (editable) handler.enable();
      else handler.disable();
    }

    if (!editable) {
      // The keyboard handler leaves a tabindex on the now read-only map.
      map.getContainer().removeAttribute('tabindex');
      return;
    }
    const zoom = L.control.zoom({ position: 'topright' }).addTo(map);
    return () => {
      zoom.remove();
    };
  }, [editable, map]);

  useEffect(() => {
    if (request) {
      map.setView([request.view.lat, request.view.lng], request.view.zoom);
    }
  }, [map, request]);

  return null;
}

export function MapViewPickerCanvas({
  label,
  initial,
  editable,
  onMove,
  request,
}: MapViewPickerCanvasProps) {
  return (
    <MapContainer
      center={[initial.lat, initial.lng]}
      zoom={initial.zoom}
      options={{
        minZoom: MAP_VIEW_MIN_ZOOM,
        maxZoom: MAP_VIEW_MAX_ZOOM,
        zoomControl: false,
        boxZoom: false,
      }}
      role={editable ? 'application' : 'img'}
      aria-label={
        editable ? `${label}：用方向鍵移動地圖，按 + 或 − 放大縮小` : label
      }
      style={{ position: 'absolute', inset: 0 }}
    >
      <TileLayer url={BASE_LAYER.url} options={TILE_OPTIONS} />
      <MapViewControls editable={editable} onMove={onMove} request={request} />
    </MapContainer>
  );
}
