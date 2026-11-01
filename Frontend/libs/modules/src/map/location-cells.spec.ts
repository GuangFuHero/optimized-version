import { cellToLatLng, getResolution, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';

import {
  buildLocationCells,
  describeLocationCellSpan,
  hasRescueMapDetailItem,
  isCoarseTicket,
  isLocationCellId,
  locationCellBoundary,
  locationCellId,
  locationCellLabelFit,
} from './location-cells';
import type { RescueMapMarkerItem } from './types';

// 光復鄉一帶，兩個點在同一個 resolution 8 格子裡，第三個點在別格。
const CELL_A = latLngToCell(23.6654321, 121.4312345, 8);
const CELL_B = latLngToCell(23.7654321, 121.4312345, 8);
const CENTRE_A = cellToLatLng(CELL_A) as [number, number];

function ticket(
  id: string,
  overrides: Partial<RescueMapMarkerItem> = {},
): RescueMapMarkerItem {
  return {
    id,
    title: id,
    subtitle: '',
    position: CENTRE_A,
    label: '待處理',
    variant: 'in-progress',
    detailType: 'ticket',
    locationCell: CELL_A,
    ...overrides,
  };
}

describe('buildLocationCells', () => {
  it('groups tickets that share a cell into one region', () => {
    const cells = buildLocationCells([
      ticket('a1'),
      ticket('a2'),
      ticket('b1', { locationCell: CELL_B }),
    ]);

    expect(
      cells.map((cell) => [cell.cell, cell.members.map((m) => m.id)]),
    ).toEqual([
      [CELL_A, ['a1', 'a2']],
      [CELL_B, ['b1']],
    ]);
    expect(cells[0]).toMatchObject({
      id: `cell:${CELL_A}`,
      detailType: 'cell',
      position: CENTRE_A,
      count: 2,
    });
  });

  it('leaves exact tickets and stations out — they keep their own pins', () => {
    const cells = buildLocationCells([
      ticket('exact', { locationCell: null }),
      ticket('station', { detailType: 'station' }),
      ticket('coarse'),
    ]);

    expect(cells.flatMap((cell) => cell.members.map((m) => m.id))).toEqual([
      'coarse',
    ]);
  });

  it('ignores a value that is not a valid H3 index rather than drawing garbage', () => {
    expect(
      buildLocationCells([ticket('bad', { locationCell: 'not-a-cell' })]),
    ).toEqual([]);
  });

  it('takes the colour of its most urgent member', () => {
    const [calm] = buildLocationCells([ticket('a1'), ticket('a2')]);
    const [urgent] = buildLocationCells([
      ticket('a1'),
      ticket('a2', { variant: 'urgent-ticket' }),
    ]);

    expect(calm.variant).toBe('in-progress');
    expect(urgent.variant).toBe('urgent-ticket');
  });
});

describe('location cell ids', () => {
  it('never looks like a uuid, so a cell and a ticket cannot be confused', () => {
    expect(locationCellId(CELL_A)).toBe(`cell:${CELL_A}`);
    expect(isLocationCellId(locationCellId(CELL_A))).toBe(true);
    expect(isLocationCellId('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(
      false,
    );
    expect(isLocationCellId(undefined)).toBe(false);
  });

  it('finds a selected cell as well as a selected marker, so selecting a cell survives a refresh', () => {
    const markers = [ticket('a1'), ticket('exact', { locationCell: null })];

    expect(hasRescueMapDetailItem(markers, 'a1')).toBe(true);
    expect(hasRescueMapDetailItem(markers, locationCellId(CELL_A))).toBe(true);
    expect(hasRescueMapDetailItem(markers, locationCellId(CELL_B))).toBe(false);
    expect(hasRescueMapDetailItem(markers, 'gone')).toBe(false);
  });

  it('finds a cell the backend counted, though none of its tickets are in the page', () => {
    const [counted] = buildLocationCells([
      ticket('b1', { locationCell: CELL_B }),
    ]);

    expect(hasRescueMapDetailItem([], locationCellId(CELL_B), [counted])).toBe(
      true,
    );
    expect(hasRescueMapDetailItem([], locationCellId(CELL_A), [counted])).toBe(
      false,
    );
  });

  it('with counted cells, finds a cell among them alone: tickets held for it may be under another filter', () => {
    const held = [ticket('a1'), ticket('a2')];

    // The counts failed after the filter changed: no cells, though the tickets read with the
    // cell, under the old filter, are still held.
    expect(hasRescueMapDetailItem(held, locationCellId(CELL_A), [])).toBe(
      false,
    );
    expect(hasRescueMapDetailItem(held, 'a1', [])).toBe(true);
  });

  it('marks a ticket coarse only when it carries a cell', () => {
    expect(isCoarseTicket(ticket('a'))).toBe(true);
    expect(isCoarseTicket(ticket('b', { locationCell: null }))).toBe(false);
  });
});

describe('locationCellBoundary', () => {
  it('returns the six corners in Leaflet [lat, lng] order, around the centre', () => {
    const corners = locationCellBoundary(CELL_A);

    expect(corners).toHaveLength(6);
    for (const [lat, lng] of corners) {
      expect(Math.abs(lat - CENTRE_A[0])).toBeLessThan(0.01);
      expect(Math.abs(lng - CENTRE_A[1])).toBeLessThan(0.01);
    }
  });
});

describe('locationCellLabelFit', () => {
  // 「203 求助」：數字 48px，加間距與「求助」共 88px。
  const label = { whole: 88, count: 48 };

  it('shows the whole label in a cell with 10px to spare', () => {
    expect(locationCellLabelFit(98, label)).toBe('whole');
  });

  it('drops 求助 before it runs into the next cell, and keeps the count', () => {
    expect(locationCellLabelFit(97, label)).toBe('count');
    expect(locationCellLabelFit(58, label)).toBe('count');
  });

  it('shrinks the count in a cell too small even for it, rather than hide it', () => {
    expect(locationCellLabelFit(57, label)).toBe('small-count');
    expect(locationCellLabelFit(0, label)).toBe('small-count');
  });
});

describe('describeLocationCellSpan', () => {
  it('reads a resolution 8 cell as about a kilometre', () => {
    expect(getResolution(CELL_A)).toBe(8);
    expect(describeLocationCellSpan(CELL_A)).toBe('約 1 公里');
  });

  it('reads a finer cell in metres and a coarser one in whole kilometres', () => {
    expect(describeLocationCellSpan(latLngToCell(23.66, 121.43, 9))).toBe(
      '約 400 公尺',
    );
    expect(describeLocationCellSpan(latLngToCell(23.66, 121.43, 4))).toBe(
      '約 52 公里',
    );
  });
});
