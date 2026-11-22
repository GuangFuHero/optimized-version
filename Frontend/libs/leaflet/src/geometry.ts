export type PolygonVertex = [latitude: number, longitude: number];

type LatLng = Readonly<PolygonVertex>;

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
 * Whether a local, open ring crosses itself or nearly folds back at a vertex. The
 * closing edge is included for rings with at least three vertices.
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
 * Approximate area in km² using an equirectangular projection. Use for display on local maps.
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
 * Convert an open ring of at least three Leaflet vertices to a closed GeoJSON polygon.
 */
export function toGeoJsonPolygon(points: readonly LatLng[]) {
  if (points.length < 3) {
    throw new RangeError('A polygon needs at least three vertices.');
  }

  const ring = points.map(([lat, lng]) => [lng, lat]);

  return {
    type: 'Polygon' as const,
    coordinates: [[...ring, ring[0]]],
  };
}

/**
 * Return an open outline for a single polygon with no holes. Return null if it
 * cannot be edited as a single ring.
 */
export function editableOutline(
  polygons: readonly (readonly (readonly LatLng[])[])[],
): PolygonVertex[] | null {
  if (polygons.length !== 1 || polygons[0].length !== 1) {
    return null;
  }

  const ring = polygons[0][0].map(([lat, lng]): PolygonVertex => [lat, lng]);
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    ring.pop();
  }

  return ring.length >= 3 ? ring : null;
}

export type PolygonRings = readonly (readonly LatLng[])[];
export type GeographicBounds = [
  west: number,
  south: number,
  east: number,
  north: number,
];

/** Whether a point lies in a ring, by the ray-casting rule. Points are [lat, lng]. */
function isInRing([lat, lng]: LatLng, ring: readonly LatLng[]): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];

    if (
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/** A polygon is its outer ring less its holes: the first ring, then the rings cut out of it. */
export function pointInPolygon(point: LatLng, rings: PolygonRings) {
  const [outer, ...holes] = rings;

  return (
    outer !== undefined &&
    isInRing(point, outer) &&
    !holes.some((hole) => isInRing(point, hole))
  );
}

/** The west, south, east and north edges of the supplied polygons. */
export function boundsOfPolygons(
  polygons: readonly PolygonRings[],
): GeographicBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lat, lng] of ring) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }
  }
  return west === Infinity ? null : [west, south, east, north];
}

/** Order polygon sets by bounding-box area so smaller features can be drawn on top. */
export function polygonsLargestFirst<
  T extends { polygons: readonly PolygonRings[] },
>(items: readonly T[]): T[] {
  return items
    .map((item) => {
      const bounds = boundsOfPolygons(item.polygons);
      const size = bounds
        ? (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])
        : 0;
      return { item, size };
    })
    .sort((a, b) => b.size - a.size)
    .map(({ item }) => item);
}
