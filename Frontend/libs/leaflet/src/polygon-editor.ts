import type { DivIconOptions, Map, PathOptions } from 'leaflet';
import { useEffect, useEffectEvent, useRef } from 'react';
import type { PolygonVertex } from './geometry.ts';
import { useMapRuntime } from './map-container.tsx';

interface EditorAppearance {
  outlineStyle?: PathOptions;
  cornerIcon?: DivIconOptions;
  midpointIcon?: DivIconOptions;
}

export interface PolygonEditorProps extends EditorAppearance {
  points: readonly Readonly<PolygonVertex>[];
  /** Receives the next outline after a drag ends or a corner is inserted or removed. */
  onChange: (points: PolygonVertex[]) => void;
}

const CORNER_ICON: DivIconOptions = { iconSize: [16, 16] };
const MIDPOINT_ICON: DivIconOptions = { iconSize: [12, 12], html: '+' };
const DRAG_CLICK_GUARD_MS = 50;

function createEditor({
  leaflet,
  map,
  points,
  appearance,
  onChange,
}: PolygonEditorProps & {
  leaflet: typeof import('leaflet');
  map: Map;
  appearance: EditorAppearance;
}) {
  const layer = leaflet.layerGroup();
  const vertices = points.map(([lat, lng]): PolygonVertex => [lat, lng]);
  const outline = leaflet
    .polygon(vertices, {
      ...appearance.outlineStyle,
      interactive: false,
    })
    .addTo(layer);
  let dragging = false;
  let restoreFrame: number | undefined;
  let ignoreClicksUntil = 0;
  let appliedCornerIcon = appearance.cornerIcon ?? CORNER_ICON;
  let appliedMidpointIcon = appearance.midpointIcon ?? MIDPOINT_ICON;

  const cornerIcon = leaflet.divIcon(appliedCornerIcon);
  const corners = vertices.map((vertex, index) => {
    const handle = leaflet
      .marker(vertex, {
        draggable: true,
        keyboard: false,
        icon: cornerIcon,
        zIndexOffset: 1000,
      })
      .addTo(layer);

    handle.on('dragstart', () => {
      if (restoreFrame !== undefined) window.cancelAnimationFrame(restoreFrame);
      dragging = true;
    });
    handle.on('drag', () => {
      const { lat, lng } = handle.getLatLng();
      vertices[index] = [lat, lng];
      outline.setLatLngs(vertices);
    });
    handle.on('dragend', () => {
      dragging = false;
      ignoreClicksUntil = performance.now() + DRAG_CLICK_GUARD_MS;
      applyIcons();
      onChange(vertices.map(([lat, lng]) => [lat, lng]));
      // If the caller keeps the old coordinates, put the handle back.
      restoreFrame = window.requestAnimationFrame(() => {
        const [lat, lng] = points[index];
        vertices[index] = [lat, lng];
        handle.setLatLng([lat, lng]);
        outline.setLatLngs(vertices);
      });
    });
    handle.on('click', () => {
      if (performance.now() < ignoreClicksUntil || vertices.length <= 3) return;

      onChange(
        vertices
          .filter((_, other) => other !== index)
          .map(([lat, lng]) => [lat, lng]),
      );
    });
    return handle;
  });

  const midpointIcon = leaflet.divIcon(appliedMidpointIcon);
  const midpoints = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const middle: PolygonVertex = [
      (vertex[0] + next[0]) / 2,
      (vertex[1] + next[1]) / 2,
    ];
    return leaflet
      .marker(middle, { keyboard: false, icon: midpointIcon })
      .on('click', () => {
        const next = vertices.map(([lat, lng]): PolygonVertex => [lat, lng]);
        next.splice(index + 1, 0, [...middle]);
        onChange(next);
      })
      .addTo(layer);
  });

  // Leaflet restarts its drag handler when setIcon runs on a draggable marker.
  function applyIcons() {
    if (dragging) return;

    const corner = appearance.cornerIcon ?? CORNER_ICON;
    if (corner !== appliedCornerIcon) {
      const icon = leaflet.divIcon(corner);
      for (const marker of corners) marker.setIcon(icon);
      appliedCornerIcon = corner;
    }
    const midpoint = appearance.midpointIcon ?? MIDPOINT_ICON;
    if (midpoint !== appliedMidpointIcon) {
      const icon = leaflet.divIcon(midpoint);
      for (const marker of midpoints) marker.setIcon(icon);
      appliedMidpointIcon = midpoint;
    }
  }

  layer.addTo(map);

  return {
    points,
    updateAppearance(next: EditorAppearance) {
      if (next.outlineStyle !== appearance.outlineStyle) {
        outline.setStyle({
          ...leaflet.Path.prototype.options,
          ...leaflet.Polygon.prototype.options,
          ...next.outlineStyle,
          interactive: false,
        });
      }
      appearance = next;
      applyIcons();
    },
    dispose() {
      if (restoreFrame !== undefined) window.cancelAnimationFrame(restoreFrame);
      layer.remove();
    },
  };
}

export function PolygonEditor({
  points,
  onChange,
  outlineStyle,
  cornerIcon,
  midpointIcon,
}: PolygonEditorProps) {
  const { map, leaflet } = useMapRuntime();
  const editor = useRef<ReturnType<typeof createEditor> | null>(null);
  const report = useEffectEvent(onChange);

  useEffect(() => {
    return () => {
      editor.current?.dispose();
      editor.current = null;
    };
  }, [map]);

  useEffect(() => {
    const previous = editor.current;
    if (points.length < 3) {
      previous?.dispose();
      editor.current = null;
      return;
    }

    const appearance = { outlineStyle, cornerIcon, midpointIcon };
    if (
      previous &&
      previous.points.length === points.length &&
      previous.points.every(
        ([lat, lng], index) =>
          lat === points[index][0] && lng === points[index][1],
      )
    ) {
      previous.updateAppearance(appearance);
      return;
    }

    previous?.dispose();
    editor.current = createEditor({
      leaflet,
      map,
      points,
      appearance,
      onChange: (vertices) => report(vertices),
    });
  }, [leaflet, map, points, outlineStyle, cornerIcon, midpointIcon]);

  return null;
}
