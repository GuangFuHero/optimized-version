// SPDX-License-Identifier: GPL-3.0-only
import type { DivIconOptions, LatLngLiteral, Marker } from 'leaflet';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMapRuntime } from './map-container.tsx';

export interface DraftPointProps {
  point: LatLngLiteral | null;
  /** Receives a new point after a drag, or null when the map moves independently. */
  onChange?: (point: LatLngLiteral | null) => void;
  /** Marker options read when the point first appears. */
  icon?: DivIconOptions;
  title?: string;
  /** Portalled into a marker that follows the draggable point. */
  children?: ReactNode;
}

const POINT_ICON: DivIconOptions = { iconSize: [18, 18] };

interface DraftMarkers {
  crosshair: Marker;
  anchor: Marker;
  dragging: boolean;
  remove: () => void;
}

export function DraftPoint({
  point,
  onChange,
  icon,
  title,
  children,
}: DraftPointProps) {
  const { map, leaflet } = useMapRuntime();
  const markers = useRef<DraftMarkers | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const report = useEffectEvent((value: LatLngLiteral | null) =>
    onChange?.(value),
  );
  const appearance = useEffectEvent(() => ({
    icon: icon ?? POINT_ICON,
    title,
  }));

  useEffect(() => {
    const release = () => {
      if (markers.current && !markers.current.dragging) report(null);
    };
    map.on('movestart zoomstart', release);

    return () => {
      map.off('movestart zoomstart', release);
      markers.current?.remove();
      markers.current = null;
    };
  }, [map]);

  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    const current = markers.current;
    if (lat === undefined || lng === undefined) {
      current?.remove();
      markers.current = null;
      return;
    }

    const position = { lat, lng };
    if (current) {
      if (!current.dragging) {
        current.crosshair.setLatLng(position);
        current.anchor.setLatLng(position);
      }
      return;
    }

    const options = appearance();
    const crosshair = leaflet.marker(position, {
      icon: leaflet.divIcon(options.icon),
      draggable: true,
      autoPan: true,
      keyboard: false,
      zIndexOffset: 1000,
      title: options.title,
    });
    const anchor = leaflet.marker(position, {
      icon: leaflet.divIcon({
        className: '',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      keyboard: false,
      zIndexOffset: 1100,
    });
    const draft: DraftMarkers = {
      crosshair,
      anchor,
      dragging: false,
      remove() {
        crosshair.remove();
        anchor.remove();
      },
    };

    crosshair.on('dragstart', () => {
      draft.dragging = true;
    });
    crosshair.on('drag', () => anchor.setLatLng(crosshair.getLatLng()));
    crosshair.on('dragend', () => {
      draft.dragging = false;
      const { lat, lng } = crosshair.getLatLng();
      report({ lat, lng });
    });
    anchor.on('add', () => {
      const element = anchor.getElement();
      if (element) {
        // Stop at the anchor even if its button removes it during the click.
        leaflet.DomEvent.on(element, 'click', leaflet.DomEvent.stopPropagation);
      }
      setHost(element ?? null);
    });
    anchor.on('remove', () => setHost(null));

    crosshair.addTo(map);
    anchor.addTo(map);
    markers.current = draft;
  }, [lat, lng, leaflet, map]);

  return host && children ? createPortal(children, host) : null;
}
