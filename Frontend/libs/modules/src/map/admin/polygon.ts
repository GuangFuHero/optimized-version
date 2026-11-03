type LatLng = [number, number];

function cross(o: LatLng, a: LatLng, b: LatLng): number {
  return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
}

function isOnSegment(a: LatLng, b: LatLng, point: LatLng): boolean {
  return (
    Math.min(a[0], b[0]) <= point[0] &&
    point[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= point[1] &&
    point[1] <= Math.max(a[1], b[1])
  );
}

/** Whether the segments a–b and c–d share a point, one end touching the other included. */
function segmentsMeet(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  return (
    (d1 === 0 && isOnSegment(a, b, c)) ||
    (d2 === 0 && isOnSegment(a, b, d)) ||
    (d3 === 0 && isOnSegment(c, d, a)) ||
    (d4 === 0 && isOnSegment(c, d, b))
  );
}

// How close to a straight line back two neighbouring edges may turn before the outline counts as
// folding back over itself: the sine of about 0.6°, far sharper than any corner a person means.
const FOLD_BACK_SINE = 0.01;

/**
 * Whether the edges p–q and q–r run back over each other at q: they turn round almost completely,
 * so the outline doubles back along itself. A spike drawn out and back, and three corners on one
 * line (an outline with no area), both do this somewhere.
 */
function foldsBack(p: LatLng, q: LatLng, r: LatLng): boolean {
  const u = [q[0] - p[0], q[1] - p[1]];
  const v = [r[0] - q[0], r[1] - q[1]];
  const lengths = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);

  if (lengths === 0) {
    return false;
  }

  const dot = u[0] * v[0] + u[1] * v[1];
  const sine = Math.abs(u[0] * v[1] - u[1] * v[0]) / lengths;

  return dot < 0 && sine < FOLD_BACK_SINE;
}

/**
 * Whether an outline crosses itself (MAP-ZD-131): two of its edges that are not neighbours meet,
 * or two neighbours fold back over each other (a spike, or corners on one line that enclose
 * nothing). The edge from the last corner back to the first counts once there are three corners;
 * before that the outline is a line and cannot cross itself. The backend only checks that it is a
 * polygon, so this is what keeps such an area from being saved.
 */
export function polygonSelfIntersects(points: readonly LatLng[]): boolean {
  const count = points.length;

  if (count < 3) {
    return false;
  }

  for (let i = 0; i < count; i++) {
    if (
      foldsBack(
        points[(i + count - 1) % count],
        points[i],
        points[(i + 1) % count],
      )
    ) {
      return true;
    }
  }

  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];

    for (let j = i + 1; j < count; j++) {
      const isNeighbour = j === i + 1 || (i === 0 && j === count - 1);

      if (isNeighbour) {
        continue;
      }

      if (segmentsMeet(a, b, points[j], points[(j + 1) % count])) {
        return true;
      }
    }
  }

  return false;
}

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LNG_AT_EQUATOR = 111.32;

/**
 * Area in km², by an equirectangular flattening round the outline's middle. Good enough to show a
 * person how big an area is, and not to decide anything by (prototype `areaKm2`).
 */
export function polygonAreaKm2(points: readonly LatLng[]): number {
  if (points.length < 3) {
    return 0;
  }

  const [lat0, lng0] = points[0];
  // Scaled by the mean latitude rather than the first corner's, so the order of the corners does
  // not change the answer.
  const meanLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const kmPerLng =
    KM_PER_DEGREE_LNG_AT_EQUATOR * Math.cos((meanLat * Math.PI) / 180);
  const flat = points.map(
    ([lat, lng]) =>
      [(lng - lng0) * kmPerLng, (lat - lat0) * KM_PER_DEGREE_LAT] as const,
  );
  let twiceArea = 0;

  flat.forEach(([x, y], index) => {
    const [nextX, nextY] = flat[(index + 1) % flat.length];
    twiceArea += x * nextY - nextX * y;
  });

  return Math.abs(twiceArea) / 2;
}

/**
 * The outline as GeoJSON for `createArea`: [lng, lat], the order the backend keeps (MAP-ZD-134),
 * and the ring closed, its first corner written again at the end. Leaflet's [lat, lng] sent as it
 * is would not fail, only put the area somewhere else.
 */
export function toGeoJsonPolygon(points: readonly LatLng[]) {
  const ring = points.map(([lat, lng]) => [lng, lat]);

  return {
    type: 'Polygon' as const,
    coordinates: [[...ring, ring[0]]],
  };
}

/**
 * The corners of an area that can have its boundary changed here: one polygon with no hole, as an
 * outline without the closing point GeoJSON repeats. A shape of several parts, or with a hole in
 * it, has no such outline (`null`), and keeps the boundary it has.
 */
export function editableOutline(
  polygons: readonly (readonly (readonly LatLng[])[])[],
): LatLng[] | null {
  if (polygons.length !== 1 || polygons[0].length !== 1) {
    return null;
  }

  const ring = polygons[0][0].map(([lat, lng]): LatLng => [lat, lng]);
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    ring.pop();
  }

  return ring.length >= 3 ? ring : null;
}
