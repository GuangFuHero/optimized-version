/** A map's centre and zoom, as an event's map view is stored (ADR-395). */
export interface MapViewValue {
  lat: number;
  lng: number;
  zoom: number;
}

/** A view for the map to move to. A new `id` moves it again, even to the same view. */
export interface MapViewPickerRequest {
  view: MapViewValue;
  id: number;
}
