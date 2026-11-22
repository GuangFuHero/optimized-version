// SPDX-License-Identifier: GPL-3.0-only
'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect } from 'react';
import {
  MapContainer,
  PointPicker,
  TileLayer,
  useMap,
} from '@rescue-frontend/leaflet';
import { designTokens } from '@rescue-frontend/ui';

import { BASE_LAYER_CONFIG } from '../../constants';
import type { RescueMapView } from '../../types';
import type { PickedPoint } from './types';

const { color } = designTokens;
const PICKED_ZOOM = 17;
const BASE_LAYER = BASE_LAYER_CONFIG['osm-direct'];
const TILE_OPTIONS = { attribution: BASE_LAYER.attribution, maxZoom: 19 };

const PIN_HTML = `<div style="padding:8px;line-height:0;cursor:grab"><span style="display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color.bg.primary.default};border:2px solid ${color.bg.neutral.default};box-shadow:${designTokens.elevationShadow.locationPin}"></span></div>`;

const PIN_ICON: L.DivIconOptions = {
  className: '',
  html: PIN_HTML,
  iconSize: [40, 40],
  iconAnchor: [20, 34],
};

interface LocationPickerCanvasProps {
  value: PickedPoint | null;
  onPick: (point: { lat: number; lng: number }) => void;
  startView: RescueMapView;
}

function LocationPickerView({
  value,
}: Pick<LocationPickerCanvasProps, 'value'>) {
  const map = useMap();

  useEffect(() => {
    map.attributionControl.setPrefix(false);
    const zoom = L.control.zoom({ position: 'topright' }).addTo(map);
    return () => {
      zoom.remove();
    };
  }, [map]);

  const lat = value?.lat;
  const lng = value?.lng;
  const source = value?.source;

  useEffect(() => {
    if (lat !== undefined && lng !== undefined && source !== 'manual') {
      map.setView([lat, lng], Math.max(map.getZoom(), PICKED_ZOOM));
    }
  }, [lat, lng, map, source]);

  return null;
}

export function LocationPickerCanvas({
  value,
  onPick,
  startView,
}: LocationPickerCanvasProps) {
  return (
    <MapContainer
      center={value ?? startView.center}
      zoom={value ? PICKED_ZOOM : startView.zoom}
      options={{ zoomControl: false }}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: value ? 'grab' : 'crosshair',
      }}
    >
      <TileLayer url={BASE_LAYER.url} options={TILE_OPTIONS} />
      <PointPicker point={value} onPick={onPick} icon={PIN_ICON} />
      <LocationPickerView value={value} />
    </MapContainer>
  );
}
