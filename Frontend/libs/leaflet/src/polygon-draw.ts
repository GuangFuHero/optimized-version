// SPDX-License-Identifier: GPL-3.0-only
import type {
  CircleMarkerOptions,
  LeafletMouseEvent,
  PathOptions,
} from 'leaflet';
import { useEffect, useEffectEvent } from 'react';
import { polygonSelfIntersects, type PolygonVertex } from './geometry.ts';
import { useMapRuntime } from './map-container.tsx';

export interface PolygonDrawProps {
  points: readonly Readonly<PolygonVertex>[];
  /** Supply a handler to enable drawing. Without it the draft is read-only. */
  onChange?: (points: PolygonVertex[]) => void;
  /** Fires on a quick repeat click near the last vertex when the outline is valid. */
  onFinish?: (points: PolygonVertex[]) => void;
  /** Set false when the surrounding map already manages double-click zoom. */
  disableDoubleClickZoom?: boolean;
  outlineStyle?: PathOptions;
  vertexStyle?: CircleMarkerOptions;
}

const REPEAT_CLICK_MS = 500;
const REPEAT_CLICK_RADIUS = 6;

export function PolygonDraw({
  points,
  onChange,
  onFinish,
  disableDoubleClickZoom = true,
  outlineStyle,
  vertexStyle,
}: PolygonDrawProps) {
  const { map, leaflet } = useMapRuntime();
  const drawing = onChange !== undefined;
  const pickCorner = useEffectEvent(
    (event: LeafletMouseEvent, lastCornerAt: number) => {
      const { lat, lng } = event.latlng;
      const last = points.at(-1);
      const now = Date.now();

      if (last && now - lastCornerAt < REPEAT_CLICK_MS) {
        const distance = map
          .latLngToContainerPoint([last[0], last[1]])
          .distanceTo(map.latLngToContainerPoint(event.latlng));
        if (distance <= REPEAT_CLICK_RADIUS) {
          if (points.length >= 3 && !polygonSelfIntersects(points)) {
            onFinish?.(
              points.map(([latitude, longitude]) => [latitude, longitude]),
            );
          }
          return lastCornerAt;
        }
      }

      if (last && last[0] === lat && last[1] === lng) return lastCornerAt;
      onChange?.([
        ...points.map(
          ([latitude, longitude]): PolygonVertex => [latitude, longitude],
        ),
        [lat, lng],
      ]);
      return now;
    },
  );

  useEffect(() => {
    if (!drawing) return;

    let lastCornerAt = 0;
    const zoomWasEnabled =
      disableDoubleClickZoom && map.doubleClickZoom.enabled();
    if (disableDoubleClickZoom) map.doubleClickZoom.disable();

    const addCorner = (event: LeafletMouseEvent) => {
      lastCornerAt = pickCorner(event, lastCornerAt);
    };
    map.on('click', addCorner);

    return () => {
      map.off('click', addCorner);
      if (zoomWasEnabled) map.doubleClickZoom.enable();
    };
  }, [disableDoubleClickZoom, drawing, map]);

  useEffect(() => {
    if (points.length === 0) return;

    const vertices = points.map(([lat, lng]): PolygonVertex => [lat, lng]);
    const layer = leaflet.layerGroup();
    const style = { ...outlineStyle, interactive: false };
    const outline =
      vertices.length >= 3
        ? leaflet.polygon(vertices, style)
        : leaflet.polyline(vertices, style);
    outline.addTo(layer);
    for (const vertex of vertices) {
      leaflet
        .circleMarker(vertex, {
          radius: 5,
          ...vertexStyle,
          interactive: false,
        })
        .addTo(layer);
    }
    layer.addTo(map);

    return () => {
      layer.remove();
    };
  }, [leaflet, map, points, outlineStyle, vertexStyle]);

  return null;
}
