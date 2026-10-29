import type { AdminBuildingMapFieldsFragment } from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

import { floorLabelsFor } from './floors';
import {
  analyzeSpace,
  floorState,
  spaceRowVisible,
  spaceSummary,
  toSpaceListRow,
  type SpaceListRow,
  type SpaceTicket,
} from './space-analysis';

type SpaceTask = SpaceTicket['tasks'][number];

function task(overrides: Partial<SpaceTask> = {}): SpaceTask {
  return {
    uuid: 'task',
    taskType: 'rescue',
    status: 'fulfilled',
    quantity: 1,
    assignedCount: 1,
    ...overrides,
  };
}

let serial = 0;
function ticket(
  overrides: Partial<Omit<SpaceTicket, 'secondaryLocation'>> & {
    floor?: string | null;
    room?: string | null;
  } = {},
): SpaceTicket {
  const { floor = null, room = null, ...rest } = overrides;
  serial += 1;
  return {
    uuid: `ticket-${serial}`,
    propertyName: `INC-${serial}`,
    title: '受困',
    status: 'pending',
    priority: 'low',
    auditStatus: 'no_audit',
    disasterTypes: [],
    updatedAt: '2026-10-29T01:00:00Z',
    secondaryLocation: { floor, room },
    tasks: [],
    ...rest,
  };
}

function building(
  overrides: Partial<AdminBuildingMapFieldsFragment> = {},
): AdminBuildingMapFieldsFragment {
  return {
    uuid: 'b1',
    name: '中正路社區大樓',
    geometry: { type: 'Point', coordinates: [121.4, 23.6] },
    floorsAboveGround: 3,
    floorsBelowGround: 0,
    createdAt: null,
    updatedAt: null,
    floors: [
      { label: 'RF' },
      { label: '3F' },
      { label: '2F' },
      { label: '1F' },
    ],
    secondaryLocation: {
      fullAddress: '花蓮縣光復鄉中正路二段120號',
      normalizationStatus: 'verified',
    },
    ...overrides,
  };
}

function row(overrides: Partial<SpaceListRow> = {}): SpaceListRow {
  return {
    kind: 'space',
    id: 'b1',
    name: '中正路社區大樓',
    address: '花蓮縣光復鄉中正路二段120號',
    summary: '4 層 · 0 張任務單',
    status: 'empty',
    priority: null,
    openNeeds: 0,
    volunteerGap: 0,
    updatedAt: null,
    lngLat: [121.4, 23.6],
    ...overrides,
  };
}

describe('floorState', () => {
  it('reads a floor with no tickets as empty', () => {
    expect(floorState([])).toBe('empty');
  });

  it('reads a floor whose only ticket is cancelled as empty, not done', () => {
    expect(floorState([ticket({ status: 'cancelled' })])).toBe('empty');
  });

  it('needs help while a ticket is pending', () => {
    expect(floorState([ticket({ status: 'pending' })])).toBe('need');
  });

  it('needs help while an in-progress ticket has a need nobody took', () => {
    expect(
      floorState([
        ticket({ status: 'in_progress', tasks: [task({ status: 'pending' })] }),
      ]),
    ).toBe('need');
  });

  it('is in progress once every need is taken', () => {
    expect(
      floorState([ticket({ status: 'in_progress', tasks: [task()] })]),
    ).toBe('progress');
  });

  it('is done when a completed ticket still has a recruiting need', () => {
    expect(
      floorState([
        ticket({ status: 'completed', tasks: [task({ status: 'pending' })] }),
      ]),
    ).toBe('done');
  });
});

describe('analyzeSpace', () => {
  it('groups tickets by floor in screen order, with unknown and off-list apart', () => {
    const a = analyzeSpace(
      ['RF', '3F', '2F', '1F'],
      [
        ticket({ floor: '3樓' }),
        ticket({ floor: null }),
        ticket({ floor: '9F' }),
      ],
    );

    expect(a.floors.map((floor) => floor.label)).toEqual([
      '1F',
      '2F',
      '3F',
      'RF',
    ]);
    expect(a.floors[2].tickets).toHaveLength(1);
    expect(a.noFloor).toHaveLength(1);
    expect(a.offList).toHaveLength(1);
    expect(a.counts).toEqual({ need: 1, progress: 0, done: 0, empty: 3 });
  });

  it('leaves cancelled tickets out of every group and count', () => {
    const a = analyzeSpace(
      ['1F', 'RF'],
      [ticket({ floor: '1F', status: 'cancelled' })],
    );

    expect(a.members).toEqual([]);
    expect(a.floors[0].tickets).toEqual([]);
    expect(a.overall).toBe('empty');
  });

  it('needs help when only an off-list ticket is pending', () => {
    expect(
      analyzeSpace(['1F', 'RF'], [ticket({ floor: '9F', status: 'pending' })])
        .overall,
    ).toBe('need');
  });

  it('is done when every ticket is completed', () => {
    expect(
      analyzeSpace(['1F', 'RF'], [ticket({ floor: '1F', status: 'completed' })])
        .overall,
    ).toBe('done');
  });
});

describe('spaceSummary', () => {
  it('names how many floors still need help', () => {
    expect(
      spaceSummary(
        analyzeSpace(floorLabelsFor(12, 1), [
          ticket({ floor: '3F' }),
          ticket({ floor: 'B1' }),
        ]),
      ),
    ).toBe('14 層 · 2 張任務單 · 2 層還需要幫忙');
  });

  it('falls back to floors in progress', () => {
    expect(
      spaceSummary(
        analyzeSpace(floorLabelsFor(1, 0), [
          ticket({ floor: '1F', status: 'in_progress' }),
        ]),
      ),
    ).toBe('2 層 · 1 張任務單 · 1 層處理中');
  });

  it('says 都完成 when everything is done', () => {
    expect(
      spaceSummary(
        analyzeSpace(floorLabelsFor(1, 0), [
          ticket({ floor: '1F', status: 'completed' }),
        ]),
      ),
    ).toBe('2 層 · 1 張任務單 · 都完成');
  });

  it('summarises an empty space', () => {
    expect(spaceSummary(analyzeSpace(floorLabelsFor(12, 1), []))).toBe(
      '14 層 · 0 張任務單',
    );
  });
});

describe('toSpaceListRow', () => {
  it('gives a space with no tickets no priority and no time', () => {
    const r = toSpaceListRow(
      building(),
      analyzeSpace(floorLabelsFor(3, 0), []),
    );

    expect(r).toMatchObject({
      kind: 'space',
      id: 'b1',
      name: '中正路社區大樓',
      address: '花蓮縣光復鄉中正路二段120號',
      status: 'empty',
      priority: null,
      updatedAt: null,
      openNeeds: 0,
      lngLat: [121.4, 23.6],
    });
  });

  it('takes priority from tickets not yet completed', () => {
    const a = analyzeSpace(
      ['1F', 'RF'],
      [
        ticket({ floor: '1F', priority: 'critical', status: 'completed' }),
        ticket({ floor: '1F', priority: 'medium', status: 'pending' }),
      ],
    );

    expect(toSpaceListRow(building(), a).priority).toBe('medium');
  });

  it('takes priority from all tickets once all are completed', () => {
    const a = analyzeSpace(
      ['1F', 'RF'],
      [
        ticket({ floor: '1F', priority: 'high', status: 'completed' }),
        ticket({ floor: '1F', priority: 'low', status: 'completed' }),
      ],
    );

    expect(toSpaceListRow(building(), a).priority).toBe('high');
  });

  it('counts open needs and the latest update', () => {
    const a = analyzeSpace(
      ['1F', 'RF'],
      [
        ticket({
          floor: '1F',
          updatedAt: '2026-10-29T03:00:00Z',
          tasks: [task({ status: 'pending' }), task({ status: 'pending' })],
        }),
        ticket({
          floor: '1F',
          status: 'completed',
          updatedAt: '2026-10-29T05:00:00Z',
          tasks: [task({ status: 'pending' })],
        }),
      ],
    );
    const r = toSpaceListRow(building(), a);

    expect(r.openNeeds).toBe(2);
    expect(r.updatedAt).toBe('2026-10-29T05:00:00Z');
  });

  it('counts the people still missing on open needs, as a ticket row does', () => {
    const a = analyzeSpace(
      ['1F', 'RF'],
      [
        ticket({
          floor: '1F',
          tasks: [
            task({ status: 'pending', quantity: 3, assignedCount: 1 }),
            task({ status: 'in_progress', quantity: 2, assignedCount: 0 }),
            task({ status: 'pending', quantity: null, assignedCount: 0 }),
            task({ status: 'fulfilled', quantity: 5, assignedCount: 0 }),
          ],
        }),
        ticket({
          floor: '1F',
          status: 'cancelled',
          tasks: [task({ status: 'pending', quantity: 9, assignedCount: 0 })],
        }),
      ],
    );

    expect(toSpaceListRow(building(), a).volunteerGap).toBe(4);
  });

  it('has no point when the building has none', () => {
    expect(
      toSpaceListRow(building({ geometry: null }), analyzeSpace(['RF'], []))
        .lngLat,
    ).toBeNull();
  });
});

describe('spaceRowVisible', () => {
  it('shows every space with no search and no filter', () => {
    expect(
      spaceRowVisible({
        row: row(),
        keyword: '',
        hasFilters: false,
        anyTicketPasses: false,
      }),
    ).toBe(true);
  });

  it('finds an empty space by name with a search alone', () => {
    expect(
      spaceRowVisible({
        row: row({ name: '宏福苑 A 座' }),
        keyword: '宏福',
        hasFilters: false,
        anyTicketPasses: false,
      }),
    ).toBe(true);
  });

  it('finds a space by address, ignoring case', () => {
    expect(
      spaceRowVisible({
        row: row({ address: 'Main St 12' }),
        keyword: 'main',
        hasFilters: false,
        anyTicketPasses: false,
      }),
    ).toBe(true);
  });

  it('hides a space the search misses', () => {
    expect(
      spaceRowVisible({
        row: row(),
        keyword: '宏福',
        hasFilters: false,
        anyTicketPasses: false,
      }),
    ).toBe(false);
  });

  it('with filters shows a space only if one of its tickets passes', () => {
    expect(
      spaceRowVisible({
        row: row(),
        keyword: '',
        hasFilters: true,
        anyTicketPasses: false,
      }),
    ).toBe(false);
    expect(
      spaceRowVisible({
        row: row(),
        keyword: '',
        hasFilters: true,
        anyTicketPasses: true,
      }),
    ).toBe(true);
  });
});
