// SPDX-License-Identifier: GPL-3.0-only
import type { RescueMapMarkerItem } from '../types';
import { dedupeMarkersById } from '../markers';

/** One page of the site list, stations or tickets. */
export interface MarkerPage {
  markers: RescueMapMarkerItem[];
  /** How many records the backend returned, for where the next page starts. */
  read: number;
  hasNextPage: boolean;
}

/**
 * A page of records as markers. `read` counts every record the backend returned, placed or not: a
 * record with no usable point draws no marker, and counting only the markers would start the next
 * page inside this one, or ask for this same page again when none of it could be drawn.
 */
export function markerPage<T>(
  items: readonly T[],
  toMarker: (item: T) => RescueMapMarkerItem | null,
  hasNextPage: boolean,
): MarkerPage {
  return {
    markers: dedupeMarkersById(
      items
        .map(toMarker)
        .filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
    ),
    read: items.length,
    hasNextPage,
  };
}
