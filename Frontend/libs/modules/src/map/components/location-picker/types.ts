/** A point marked on the small map, and how it got there — shown beside its coordinates. */
export interface PickedPoint {
  lat: number;
  lng: number;
  /** Brought from the main map; the device's location; or a tap or drag on this map. */
  source: 'seed' | 'gps' | 'manual';
}
