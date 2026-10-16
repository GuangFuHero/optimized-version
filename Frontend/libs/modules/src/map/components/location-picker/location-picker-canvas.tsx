'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { designTokens } from '@rescue-frontend/ui';

import { BASE_LAYER_CONFIG } from '../../constants';
import type { PickedPoint } from './types';

const { color } = designTokens;

/** 光復鄉, where the map opens with no point yet (prototype `tk-locpicker.jsx:4`). */
const FALLBACK_CENTER: [number, number] = [23.6725, 121.4235];
const FALLBACK_ZOOM = 14;
/** Close enough to tell which street the pin is on. */
const PICKED_ZOOM = 17;
/** The main map's default base layer (`use-rescue-map-controller.ts`), so its tiles are cached. */
const BASE_LAYER = BASE_LAYER_CONFIG['osm-direct'];

interface LocationPickerCanvasProps {
  value: PickedPoint | null;
  onPick: (point: { lat: number; lng: number }) => void;
}

// A teardrop in the ticket's own orange, with room around it to grab (prototype `pinHtml`).
const PIN_HTML = `<div style="padding:8px;line-height:0;cursor:grab"><span style="display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color.bg.primary.default};border:2px solid ${color.bg.neutral.default};box-shadow:0 4px 12px rgba(0,0,0,.28)"></span></div>`;

function createPinIcon() {
  return L.divIcon({
    className: '',
    html: PIN_HTML,
    iconSize: [40, 40],
    iconAnchor: [20, 34],
  });
}

/**
 * The Leaflet part of `LocationPicker`, loaded only in the browser. A tap moves the pin there and
 * the pin drags; either way the point goes up through `onPick`. A point found by the device or
 * brought from the main map moves the view to it; one placed by hand leaves the view alone.
 */
export function LocationPickerCanvas({
  value,
  onPick,
}: LocationPickerCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  const initialValueRef = useRef(value);

  onPickRef.current = onPick;

  useEffect(() => {
    const host = hostRef.current;

    if (!host || mapRef.current) {
      return;
    }

    const initial = initialValueRef.current;
    const map = L.map(host, {
      center: initial ? [initial.lat, initial.lng] : FALLBACK_CENTER,
      zoom: initial ? PICKED_ZOOM : FALLBACK_ZOOM,
      zoomControl: false,
    });

    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(BASE_LAYER.url, {
      attribution: BASE_LAYER.attribution,
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (event) =>
      onPickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }),
    );
    mapRef.current = map;

    // The drawer slides in, so the map is first laid out at a size it does not keep.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
  }, []);

  const lat = value?.lat;
  const lng = value?.lng;
  const source = value?.source;

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (lat === undefined || lng === undefined) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }

    if (pinRef.current) {
      pinRef.current.setLatLng([lat, lng]);
    } else {
      const pin = L.marker([lat, lng], {
        draggable: true,
        icon: createPinIcon(),
        keyboard: false,
      });

      pin.on('dragend', () => {
        const point = pin.getLatLng();
        onPickRef.current({ lat: point.lat, lng: point.lng });
      });
      pin.addTo(map);
      pinRef.current = pin;
    }

    if (source !== 'manual') {
      map.setView([lat, lng], Math.max(map.getZoom(), PICKED_ZOOM));
    }
  }, [lat, lng, source]);

  return (
    <div
      ref={hostRef}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: value ? 'grab' : 'crosshair',
      }}
    />
  );
}
