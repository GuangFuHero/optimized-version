import { describe, expect, it } from 'vitest';

import type { RescueMapMarkerItem } from '../types';
import { markerPage } from './list-pages';

/** A record that either has a point (a marker) or not (null), as `mapStationToMarker` reads it. */
interface Row {
  id: string;
  placed: boolean;
}

const toMarker = (row: Row) =>
  row.placed ? ({ id: row.id } as RescueMapMarkerItem) : null;

describe('a page of the site list', () => {
  it('counts every record returned, placed or not', () => {
    const page = markerPage(
      [
        { id: 'a', placed: true },
        { id: 'b', placed: false },
        { id: 'c', placed: true },
      ],
      toMarker,
      true,
    );

    expect(page.markers.map(({ id }) => id)).toEqual(['a', 'c']);
    expect(page.read).toBe(3);
  });

  it('still moves on when no record on the page could be drawn', () => {
    const page = markerPage(
      [
        { id: 'a', placed: false },
        { id: 'b', placed: false },
      ],
      toMarker,
      true,
    );

    expect(page.markers).toEqual([]);
    expect(page.read).toBe(2);
    expect(page.hasNextPage).toBe(true);
  });

  it('lists a record returned twice once', () => {
    const page = markerPage(
      [
        { id: 'a', placed: true },
        { id: 'a', placed: true },
      ],
      toMarker,
      false,
    );

    expect(page.markers.map(({ id }) => id)).toEqual(['a']);
    expect(page.read).toBe(2);
  });
});
