import type {
  DivIconOptions,
  LatLngLiteral,
  LeafletMouseEvent,
  Marker,
} from 'leaflet';
import { useEffect, useEffectEvent, useRef } from 'react';
import { useMapRuntime } from './map-container.tsx';

export interface PointPickerProps {
  point: LatLngLiteral | null;
  onPick: (point: LatLngLiteral) => void;
  /** Marker options read when the point first appears. */
  icon?: DivIconOptions;
}

const PICKER_ICON: DivIconOptions = { iconSize: [18, 18] };

export function PointPicker({ point, onPick, icon }: PointPickerProps) {
  const { map, leaflet } = useMapRuntime();
  const marker = useRef<Marker | null>(null);
  const report = useEffectEvent(({ lat, lng }: LatLngLiteral) =>
    onPick({ lat, lng }),
  );
  const getIcon = useEffectEvent(() => icon ?? PICKER_ICON);

  useEffect(() => {
    const pick = (event: LeafletMouseEvent) => report(event.latlng);
    map.on('click', pick);
    return () => {
      map.off('click', pick);
      marker.current?.remove();
      marker.current = null;
    };
  }, [map]);

  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      marker.current?.remove();
      marker.current = null;
      return;
    }

    if (marker.current) {
      marker.current.setLatLng([lat, lng]);
      return;
    }

    const pin = leaflet.marker([lat, lng], {
      draggable: true,
      keyboard: false,
      icon: leaflet.divIcon(getIcon()),
    });
    pin.on('dragend', () => report(pin.getLatLng()));
    pin.addTo(map);
    marker.current = pin;
  }, [lat, lng, leaflet, map]);

  return null;
}
