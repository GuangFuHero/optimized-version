import { cellToLatLng, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';

import {
  ticketCellStatuses,
  ticketCellsNotice,
  toLocationCells,
} from './ticket-cells';

// Around 光復: two resolution 8 cells.
const CELL_A = latLngToCell(23.6654321, 121.4312345, 8);
const CELL_B = latLngToCell(23.7654321, 121.4312345, 8);

describe('ticketCellStatuses', () => {
  it('sends nothing when no status is picked: the filter then means all of them', () => {
    expect(ticketCellStatuses(undefined)).toBeUndefined();
    expect(ticketCellStatuses([])).toBeUndefined();
  });

  it('sends the statuses picked, each once and in one order', () => {
    expect(ticketCellStatuses(['pending'])).toEqual(['pending']);
    expect(ticketCellStatuses(['in_progress', 'pending', 'pending'])).toEqual([
      'in_progress',
      'pending',
    ]);
  });

  it('sends nothing when all four are picked, as that also means all of them', () => {
    expect(
      ticketCellStatuses(['pending', 'in_progress', 'completed', 'cancelled']),
    ).toBeUndefined();
  });

  it('reads older spellings as the status they stand for', () => {
    expect(ticketCellStatuses(['open', 'closed'])).toEqual([
      'completed',
      'pending',
    ]);
    expect(ticketCellStatuses(['open', 'pending'])).toEqual(['pending']);
  });

  it('ignores what is not a ticket status, as the filter does', () => {
    expect(ticketCellStatuses(['shelter'])).toBeUndefined();
    expect(ticketCellStatuses(['shelter', 'cancelled'])).toEqual(['cancelled']);
  });
});

describe('toLocationCells', () => {
  it("draws each cell at its centre, with the backend's count", () => {
    const [cell] = toLocationCells([
      { cell: CELL_A, ticketCount: 245, urgentCount: 0 },
    ]);

    expect(cell).toEqual({
      id: `cell:${CELL_A}`,
      cell: CELL_A,
      detailType: 'cell',
      position: cellToLatLng(CELL_A),
      variant: 'in-progress',
      count: 245,
      members: [],
    });
  });

  it('colours a cell urgent when any ticket in it is', () => {
    const cells = toLocationCells([
      { cell: CELL_A, ticketCount: 3, urgentCount: 1 },
      { cell: CELL_B, ticketCount: 3, urgentCount: 0 },
    ]);

    expect(cells.map((cell) => cell.variant)).toEqual([
      'urgent-ticket',
      'in-progress',
    ]);
  });

  it('leaves out a row whose cell is not a valid H3 index', () => {
    expect(
      toLocationCells([
        { cell: 'not-a-cell', ticketCount: 1, urgentCount: 0 },
        { cell: CELL_B, ticketCount: 2, urgentCount: 0 },
      ]).map((cell) => cell.cell),
    ).toEqual([CELL_B]);
  });
});

describe('ticketCellsNotice', () => {
  const REFUSED = '這個範圍的單太多，計算逾時已中止，請放大地圖再試';

  it("says what the backend said when it refused, such as the count's time limit", () => {
    expect(ticketCellsNotice({ graphQLErrors: [{ message: REFUSED }] })).toBe(
      REFUSED,
    );
  });

  it('says nothing when the counts came back, or the request never got an answer', () => {
    expect(ticketCellsNotice(undefined)).toBeNull();
    expect(ticketCellsNotice({ graphQLErrors: [] })).toBeNull();
    expect(
      ticketCellsNotice({ graphQLErrors: [{ message: '  ' }] }),
    ).toBeNull();
  });
});
