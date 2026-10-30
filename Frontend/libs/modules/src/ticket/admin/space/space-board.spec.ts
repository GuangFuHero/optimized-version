import { describe, expect, it } from 'vitest';

import { EMPTY_TICKET_FILTERS } from '../ticket-board/model/ticket-filters';
import type { SpaceListRow, SpaceTicket } from './space-analysis';
import {
  sortSpaceRows,
  spaceTicketPasses,
  visibleSpaceRows,
} from './space-board';

function ticket(overrides: Partial<SpaceTicket> = {}): SpaceTicket {
  return {
    uuid: 't1',
    propertyName: 'INC-1',
    title: '受困',
    status: 'pending',
    priority: 'high',
    disasterTypes: ['flood'],
    updatedAt: '2026-10-29T01:00:00Z',
    secondaryLocation: { floor: '3F', room: 'A' },
    tasks: [
      {
        uuid: 'k1',
        taskType: 'rescue',
        status: 'pending',
        quantity: 2,
        assignedCount: 0,
      },
    ],
    ...overrides,
  };
}

function row(overrides: Partial<SpaceListRow> = {}): SpaceListRow {
  return {
    kind: 'space',
    id: 's1',
    name: '林森61',
    address: '花蓮縣光復鄉林森路61號',
    summary: '',
    status: 'need',
    priority: 'medium',
    volunteerGap: 0,
    ticketCount: 0,
    needFloors: 0,
    updatedAt: null,
    lngLat: null,
    ...overrides,
  };
}

describe('spaceTicketPasses', () => {
  const f = EMPTY_TICKET_FILTERS;

  it('applies each board filter the way the server does', () => {
    expect(spaceTicketPasses(ticket(), { ...f, status: 'pending' })).toBe(true);
    expect(spaceTicketPasses(ticket(), { ...f, status: 'completed' })).toBe(
      false,
    );
    expect(spaceTicketPasses(ticket(), { ...f, priority: 'high' })).toBe(true);
    expect(spaceTicketPasses(ticket(), { ...f, priority: 'low' })).toBe(false);
    expect(spaceTicketPasses(ticket(), { ...f, taskType: 'rescue' })).toBe(
      true,
    );
    expect(spaceTicketPasses(ticket(), { ...f, taskType: 'supply' })).toBe(
      false,
    );
    expect(spaceTicketPasses(ticket(), { ...f, disaster: 'flood' })).toBe(true);
    expect(spaceTicketPasses(ticket(), { ...f, disaster: 'quake' })).toBe(
      false,
    );
  });

  it('needs every chosen filter to pass', () => {
    expect(
      spaceTicketPasses(ticket(), { ...f, status: 'pending', priority: 'low' }),
    ).toBe(false);
  });
});

describe('sortSpaceRows', () => {
  it('sorts by priority, then people missing, then the latest update', () => {
    const rows = [
      row({ id: 'none', priority: null }),
      row({ id: 'low', priority: 'low' }),
      row({
        id: 'crit-old',
        priority: 'critical',
        // 00:30 UTC: older than crit-new's 05:00, though it sorts later as text.
        updatedAt: '2026-10-29T08:30:00+08:00',
      }),
      row({
        id: 'crit-new',
        priority: 'critical',
        updatedAt: '2026-10-29T05:00:00Z',
      }),
      row({ id: 'crit-gap', priority: 'critical', volunteerGap: 3 }),
    ];

    expect(sortSpaceRows(rows).map((r) => r.id)).toEqual([
      'crit-gap',
      'crit-new',
      'crit-old',
      'low',
      'none',
    ]);
  });
});

describe('visibleSpaceRows', () => {
  const spaces = [
    {
      row: row({ id: 'a', name: '林森61', priority: 'low' }),
      tickets: [ticket()],
    },
    {
      row: row({ id: 'b', name: '中正大樓', priority: 'critical' }),
      tickets: [ticket({ priority: 'low' })],
    },
  ];

  it('lists every space, most urgent first, with nothing chosen', () => {
    expect(
      visibleSpaceRows(spaces, EMPTY_TICKET_FILTERS).map((r) => r.id),
    ).toEqual(['b', 'a']);
  });

  it('with a filter, lists a space only if one of its tickets passes', () => {
    expect(
      visibleSpaceRows(spaces, {
        ...EMPTY_TICKET_FILTERS,
        priority: 'high',
      }).map((r) => r.id),
    ).toEqual(['a']);
  });

  it('with a search alone, lists a space its name or address has', () => {
    expect(
      visibleSpaceRows(spaces, { ...EMPTY_TICKET_FILTERS, q: '中正' }).map(
        (r) => r.id,
      ),
    ).toEqual(['b']);
  });
});
