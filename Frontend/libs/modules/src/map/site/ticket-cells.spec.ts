import { cellToLatLng, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';

import {
  readTicketCells,
  TICKET_CELLS_FAILED_NOTICE,
  TICKET_CELLS_TIME_LIMIT_REFUSAL,
  ticketCellStatuses,
  ticketCellsNotice,
  toLocationCells,
} from './ticket-cells';

// Around 光復: two resolution 8 cells.
const CELL_A = latLngToCell(23.6654321, 121.4312345, 8);
const CELL_B = latLngToCell(23.7654321, 121.4312345, 8);

// As the backend sends it: the refusal with its ceiling after it (`app/core/search.py`).
const TIME_LIMIT_ERROR = {
  graphQLErrors: [
    {
      message: '這個範圍的單太多，計算逾時已中止，請放大地圖再試（上限 3 秒）',
    },
  ],
};

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
  it("says the backend's sentence, with zooming in, only for the count's time limit", () => {
    expect(ticketCellsNotice(TIME_LIMIT_ERROR)).toEqual({
      text: TICKET_CELLS_TIME_LIMIT_REFUSAL,
      zoomIn: true,
    });
  });

  it("says a fixed line, without zooming in, for the backend's other errors", () => {
    for (const message of ['Unexpected error.', 'Permission Denied.']) {
      expect(ticketCellsNotice({ graphQLErrors: [{ message }] })).toEqual({
        text: TICKET_CELLS_FAILED_NOTICE,
        zoomIn: false,
      });
    }
  });

  it('says the fixed line too when the request got no answer', () => {
    expect(ticketCellsNotice({ graphQLErrors: [] })).toEqual({
      text: TICKET_CELLS_FAILED_NOTICE,
      zoomIn: false,
    });
    expect(ticketCellsNotice(undefined)).toEqual({
      text: TICKET_CELLS_FAILED_NOTICE,
      zoomIn: false,
    });
  });
});

describe('readTicketCells', () => {
  const kept = toLocationCells([
    { cell: CELL_A, ticketCount: 245, urgentCount: 0 },
  ]);

  it('draws the counted cells, and says nothing, when the read worked', () => {
    const read = readTicketCells(
      [{ cell: CELL_B, ticketCount: 3, urgentCount: 0 }],
      undefined,
      kept,
    );

    expect(read.cells.map((cell) => cell.cell)).toEqual([CELL_B]);
    expect(read.notice).toBeNull();
  });

  it('keeps the cells it is given when the read failed, and says why', () => {
    const read = readTicketCells(null, TIME_LIMIT_ERROR, kept);

    expect(read.cells).toBe(kept);
    expect(read.notice?.zoomIn).toBe(true);
  });

  it('draws no cells when a failed read is given none, as after a change of filter', () => {
    const read = readTicketCells(
      undefined,
      { graphQLErrors: [{ message: 'Unexpected error.' }] },
      [],
    );

    expect(read.cells).toEqual([]);
    expect(read.notice).toEqual({
      text: TICKET_CELLS_FAILED_NOTICE,
      zoomIn: false,
    });
  });
});
