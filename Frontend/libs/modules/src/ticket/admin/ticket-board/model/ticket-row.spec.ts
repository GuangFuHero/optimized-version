import type {
  AdminTaskFieldsFragment,
  AdminTicketFieldsFragment,
} from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

import { toTicketRow, UNTITLED_TICKET } from './ticket-row';

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
  over: Partial<AdminTicketFieldsFragment> = {},
  tasks: AdminTaskFieldsFragment[] = [],
) => ({
  uuid: 't1',
  title: '淹水',
  status: 'pending',
  priority: 'high',
  auditStatus: 'need_audit',
  disasterTypes: ['flood'],
  geometry: { type: 'Point' as const, coordinates: [121.5, 25.0] },
  locationCell: null,
  secondaryLocation: { county: '花蓮縣', town: '光復鄉' },
  updatedAt: '2026-10-21T00:00:00Z',
  viewerCanEdit: true,
  viewerCanDelete: true,
  viewerCanAudit: true,
  viewerCanViewHistory: true,
  ...over,
  tasks,
});

describe('toTicketRow', () => {
  it('carries the ticket\'s own permission flags on raw', () => {
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
});
