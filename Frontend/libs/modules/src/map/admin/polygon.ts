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

/**
 * Whether an outline crosses itself (MAP-ZD-131): two of its edges that are not neighbours meet.
 * The edge from the last corner back to the first counts once there are three corners; before that
 * the outline is a line and cannot cross itself.
 */
export function polygonSelfIntersects(points: readonly LatLng[]): boolean {
  const count = points.length;

  if (count < 4) {
    return false;
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
