# @rescue-frontend/leaflet

Build editable Leaflet maps in React with headless components for drawing, point picking, live layers, and viewport updates. The package manages Leaflet layers, gestures, and cleanup. Use your own tiles, styling, and API for undoable saves.

## Install

```sh
npm install @rescue-frontend/leaflet leaflet@1.9.4
```

## First map

Import Leaflet's stylesheet once and give `MapContainer` a height.

```tsx
'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from '@rescue-frontend/leaflet';

export function FirstMap() {
  return (
    <MapContainer center={[23.89, 121]} zoom={13} style={{ height: 420 }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" options={{ attribution: '© OpenStreetMap contributors' }} />
    </MapContainer>
  );
}
```

## Example applications

- **Field dispatch.** Cluster station and incident markers, fetch records for the visible map bounds, and attach a confirmation card to a dropped pin.
- **Coverage editor.** Draw delivery or service territories, move vertices, validate outlines, and save GeoJSON with a five-second undo window.
- **Zone status map.** Show overlapping districts or closures and give important labels first choice of space around markers, map controls, and other labels.
- **Location form.** Let users click a site or drag a pin, then pass the coordinates to the form's existing state.

## Draw and edit a polygon

Click the map to add vertices. Switch to editing to drag a vertex, insert one at a midpoint, or remove one by clicking it. The editor keeps at least three vertices.

```tsx
'use client';

import { useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, PolygonDraw, PolygonEditor, TileLayer, type PolygonVertex } from '@rescue-frontend/leaflet';
import { polygonSelfIntersects } from '@rescue-frontend/leaflet/geometry';

export function BoundaryMap() {
  const [points, setPoints] = useState<PolygonVertex[]>([]);
  const [editing, setEditing] = useState(false);
  const valid = points.length >= 3 && !polygonSelfIntersects(points);

  return (
    <>
      <button onClick={() => setPoints(points.slice(0, -1))} disabled={editing || !points.length}>
        Undo vertex
      </button>
      <button onClick={() => setEditing(true)} disabled={editing || !valid}>
        Edit outline
      </button>
      <button
        onClick={() => {
          setPoints([]);
          setEditing(false);
        }}
      >
        Start over
      </button>
      <MapContainer center={[23.89, 121]} zoom={13} style={{ height: 420 }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" options={{ attribution: '© OpenStreetMap contributors' }} />
        {editing ? <PolygonEditor points={points} onChange={setPoints} /> : <PolygonDraw points={points} onChange={setPoints} onFinish={() => setEditing(true)} />}
      </MapContainer>
    </>
  );
}
```

- `MapContainer` reads `center`, `zoom`, and Leaflet `options` when it creates the map. It forwards ordinary `div` attributes and keeps the map sized to that element. Descendants render when the map is ready. Call `useMap()` inside a descendant for native Leaflet methods such as `flyTo` and `fitBounds`. Hiding the map with React `Activity` releases it. Showing it again opens at the initial view.
- `TileLayer` reads its options when it mounts or its URL changes. Change its React `key` to replace it with different options for the same URL.
- `PolygonDraw` uses an open `[latitude, longitude]` ring. It previews a line until the third vertex and switches to a polygon. Supply `onChange` to collect clicks. A repeat click within 6 pixels of the last vertex and within 500 ms finishes a valid outline. Omit `onChange` to display a draft without changing map gestures. Pass `outlineStyle` and `vertexStyle` for custom Leaflet styles.
- `PolygonEditor` moves the outline during a drag and reports coordinates when the handle is released. Click a midpoint to insert a vertex or a corner to remove it. It keeps at least three vertices. Pass Leaflet `outlineStyle`, `cornerIcon`, and `midpointIcon` options to style it.
- `PointPicker` reports map clicks and completed pin drags through `onPick`. Pass the chosen `{ lat, lng }` back as `point`.
- `DraftPoint` shows a draggable point and anchors its React children above the map at that location. Use `onChange` to accept a drag or clear the point when the map moves. Both point components read plain Leaflet `DivIconOptions` as `icon` when the point first appears.

## Show live map data

Pass your station records to `MarkerLayer` and your area records to `PolygonLayer`. Use `ViewportObserver` to update a search after the user stops panning or zooming.

```tsx
<MapContainer center={[23.89, 121]} zoom={13} options={{ maxZoom: 18 }} style={{ height: 420 }}>
  <TileLayer url={tileUrl} options={{ attribution }} />
  <MarkerLayer
    items={stations}
    cluster
    appearance={(station) => {
      const content = document.createElement('span');
      content.textContent = station.name;
      return { tooltip: { content } };
    }}
  />
  <PolygonLayer items={surveyAreas} getLabel={(area) => ({ text: area.name, priority: area.priority })} />
  <ViewportObserver onChange={setViewport} settleMs={250} />
</MapContainer>
```

- `MarkerLayer` expects `id` and `position` on each item. It moves or removes markers in place by ID. Use `appearanceKey` to reuse icons and tooltips across data refreshes. Add another layer without `cluster` for markers that always appear on their own. Clustering loads on demand and needs a finite maximum zoom from the map options or tile layer.
- `PolygonLayer` accepts `id` and `polygons`. Each polygon is an outer ring followed by any holes, and coordinates are `[latitude, longitude]`. It lays out optional labels around controls, markers and other labels, trying higher priorities first. Use `getRevision` to refresh an item only when its geometry or appearance changes. Import `placeLabels` from `/labels` to run the placement calculation on your own screen rectangles.
- `ViewportObserver` reports the native map center, zoom, and bounding edges on mount and after movement. Use `settleMs` to coalesce reports and `wrapLongitude` to normalize the center longitude. Use `useMapViewport(map)` to read the same view from outside the map container.

## Save edits with undo

Keep local drawing state in the editor. Call `save` when the user presses Save and use `pending[id]` to show the proposed edit over the last server response. The hook waits five seconds by default, lets the user undo the queued write, and holds the proposal until your request settles.

```tsx
'use client';

import { useState } from 'react';
import { useEditSync, type HeldEdit } from '@rescue-frontend/leaflet/edit-sync';
import { polygonSelfIntersects, toGeoJsonPolygon, type PolygonVertex } from '@rescue-frontend/leaflet/geometry';

function SaveBoundary({ id, points }: { id: string; points: PolygonVertex[] }) {
  const { pending, save } = useEditSync<PolygonVertex[]>();
  const [held, setHeld] = useState<HeldEdit | null>(null);
  const [error, setError] = useState('');
  const canSave = !pending[id] && points.length >= 3 && !polygonSelfIntersects(points);

  const saveBoundary = () => {
    setError('');
    setHeld(
      save(id, points, {
        persist: async ({ keepalive }) => {
          setHeld(null);
          const response = await fetch(`/api/areas/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toGeoJsonPolygon(points)),
            keepalive,
          });
          if (!response.ok) throw new Error('Could not save the boundary.');
        },
        onError: () => setError('Could not confirm the save. Check the current boundary.'),
      }),
    );
  };

  return (
    <>
      <button onClick={saveBoundary} disabled={!canSave}>
        Save boundary
      </button>
      {held && (
        <button
          onClick={() => {
            if (held.undo()) setHeld(null);
          }}
        >
          Undo save
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

Use one queue per save scope. Mount it above a map route to keep pending writes through navigation inside the app. Ordinary page exit attempts to send waiting writes with `keepalive`. Call `reset()` before switching accounts to drop waiting writes and ignore the results of writes already sent. Keep cache refresh inside `persist` if the pending edit should stay on screen until fresh server data arrives.

The queue reads `undoMs` when it first mounts. Supply your own endpoint for the example's PUT request.

## Server rendering

The React entry point can render an empty container on the server. Leaflet loads in the browser. In Next.js, put interactive map state in a Client Component and import Leaflet's CSS with your global styles. The `/geometry` and `/labels` entry points also work in Node. Geometry helpers cover outline validation, GeoJSON conversion, bounds, and point containment in polygons with holes.
