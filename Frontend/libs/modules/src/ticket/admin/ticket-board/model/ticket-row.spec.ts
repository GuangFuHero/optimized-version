import type { AdminTaskFieldsFragment } from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

import {
  needChipLabel,
  needProgress,
  toTaskRows,
  toTicketRow,
  UNTITLED_TICKET,
  type TicketListItem,
} from './ticket-row';

const task = (
  over: Partial<AdminTaskFieldsFragment> = {},
): AdminTaskFieldsFragment => ({
  uuid: 'k1',
  ticketUuid: 't1',
  taskType: 'supply',
  taskName: '物資',
  quantity: 5,
  status: 'pending',
  source: 'admin',
  assignedCount: 2,
  assignments: [],
  ...over,
});

const ticket = (
  over: Partial<TicketListItem> = {},
  tasks: AdminTaskFieldsFragment[] = [],
): TicketListItem => ({
  uuid: 't1',
  title: '淹水',
  status: 'pending',
  priority: 'high',
  auditStatus: 'need_audit',
  disasterTypes: ['flood'],
  geometry: { type: 'Point' as const, coordinates: [121.5, 25.0] },
  locationCell: null,
  secondaryLocation: {
    county: '花蓮縣',
    town: '光復鄉',
    fullAddress: '花蓮縣光復鄉中正路二段120號',
  },
  photos: [],
  responsibleTeams: [],
  updatedAt: '2026-10-21T00:00:00Z',
  viewerCanEdit: true,
  viewerCanDelete: true,
  viewerCanAudit: true,
  viewerCanViewHistory: true,
  ...over,
  tasks,
});

describe('toTicketRow', () => {
  it("carries the ticket's own permission flags on raw", () => {
    const row = toTicketRow(
      ticket({ viewerCanEdit: false, viewerCanDelete: true }),
    );
    expect(row.raw.viewerCanEdit).toBe(false);
    expect(row.raw.viewerCanDelete).toBe(true);
  });

  it('gives an open need its missing people as gap', () => {
    const row = toTicketRow(ticket({}, [task()]));
    expect(row.tasks[0].gap).toBe(3);
  });

  it('counts a legacy in_progress need as open', () => {
    const row = toTicketRow(ticket({}, [task({ status: 'in_progress' })]));
    expect(row.tasks[0].gap).toBe(3);
  });

  it('gives no gap to a closed need or one without a quantity', () => {
    const row = toTicketRow(
      ticket({}, [task({ status: 'fulfilled' }), task({ quantity: null })]),
    );
    expect(row.tasks.map((t) => t.gap)).toEqual([0, 0]);
  });

  it('sums the gap over the ticket', () => {
    const row = toTicketRow(
      ticket({}, [task(), task({ quantity: 3, assignedCount: 2 })]),
    );
    expect(row.volunteerGap).toBe(4);
  });

  it('marks a coarse ticket', () => {
    const row = toTicketRow(ticket({ locationCell: '88abc' }));
    expect(row.isCoarse).toBe(true);
    expect(row.locationCell).toBe('88abc');
    expect(row.position).toEqual([25.0, 121.5]);
    expect(row.area).toBe('花蓮縣光復鄉');
    expect(toTicketRow(ticket()).isCoarse).toBe(false);
  });

  it('names an untitled ticket', () => {
    expect(toTicketRow(ticket({ title: '  ' })).title).toBe(UNTITLED_TICKET);
  });

  it('carries the street line, the photo count and the 責任區 teams', () => {
    const row = toTicketRow(
      ticket({
        photos: [{ uuid: 'p1' }, { uuid: 'p2' }],
        responsibleTeams: [
          { uuid: 'a', name: '壯闊台灣' },
          { uuid: 'b', name: '花蓮縣政府災防辦' },
        ],
      }),
    );
    expect(row.address).toBe('花蓮縣光復鄉中正路二段120號');
    expect(row.photoCount).toBe(2);
    expect(row.teamNames).toEqual(['壯闊台灣', '花蓮縣政府災防辦']);
  });

  it('has no street line where the address is withheld', () => {
    const row = toTicketRow(
      ticket({ locationCell: '88abc', secondaryLocation: null }),
    );
    expect(row.address).toBeNull();
  });
});

describe('needProgress', () => {
  const rows = (...over: Partial<AdminTaskFieldsFragment>[]) =>
    toTaskRows(over.map((o) => task(o)));

  it('counts a need short of people as waiting', () => {
    const progress = needProgress(
      rows(
        { quantity: 2, assignedCount: 1 },
        { quantity: 1, assignedCount: 1 },
      ),
    );
    expect(progress.label).toBe('待承接 1／2');
    expect(progress.ratio).toBe(0.5);
  });

  it('counts an open need with no quantity as waiting until someone is on it', () => {
    expect(needProgress(rows({ quantity: null, assignedCount: 0 })).label).toBe(
      '待承接 1／1',
    );
    expect(needProgress(rows({ quantity: null, assignedCount: 1 })).label).toBe(
      '在途 1／1',
    );
  });

  it('says 已滿足 once every need has everyone, never 完成', () => {
    const progress = needProgress(
      rows({ status: 'fulfilled', quantity: 1, assignedCount: 1 }),
    );
    expect(progress.label).toBe('1／1 已滿足');
    expect(progress.ratio).toBe(1);
  });

  it('leaves a cancelled need out', () => {
    const progress = needProgress(
      rows(
        { status: 'canceled', quantity: 3, assignedCount: 0 },
        { status: 'fulfilled', quantity: 1, assignedCount: 1 },
      ),
    );
    expect(progress.total).toBe(1);
    expect(progress.label).toBe('1／1 已滿足');
  });

  it('has no line without a need to count', () => {
    expect(needProgress([]).label).toBeNull();
    expect(needProgress(rows({ status: 'canceled' })).label).toBeNull();
  });
});

describe('needChipLabel', () => {
  it('names a need with its quantity, or alone', () => {
    expect(needChipLabel({ taskName: '清淤人力', quantity: 4 })).toBe(
      '清淤人力 ×4',
    );
    expect(needChipLabel({ taskName: '常備藥品', quantity: null })).toBe(
      '常備藥品',
    );
  });
});
