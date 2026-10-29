/**
 * A station's GeoJSON point (`[lng, lat]`) as Leaflet's `[lat, lng]`, or null when the station
 * has no point or its coordinates aren't numbers.
 */
export function stationPoint(geometry: unknown): [number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const { coordinates } = geometry as { coordinates?: unknown };
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as unknown[];
  return typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
    ? [lat, lng]
    : null;
}
