import { describe, expect, it } from 'vitest';

import {
  formatRequestProgress,
  readMyRequests,
  type MyTicketRow,
} from './my-requests';

const open = { status: 'pending' };
const full = { status: 'fulfilled' };

const DONE = '這張單已經完成，不再需要人手。';

describe('formatRequestProgress', () => {
  it('says how many needs still lack people when none has its people yet', () => {
    expect(formatRequestProgress('pending', [open, open, open])).toBe(
      '3 件事還缺人',
    );
    expect(formatRequestProgress('in_progress', [open])).toBe('1 件事還缺人');
  });

  it('counts the needs that have their people apart from those still short', () => {
    expect(formatRequestProgress('in_progress', [full, open, open])).toBe(
      '3 件事：1 件已滿、2 件還缺人',
    );
  });

  it('says a completed request needs nobody more, with its needs deleted or not', () => {
    expect(formatRequestProgress('completed', [full, full])).toBe(DONE);
    expect(formatRequestProgress('completed', [])).toBe(DONE);
  });

  it('says a request cancelled by hand, before statuses were derived, needs nobody', () => {
    expect(formatRequestProgress('cancelled', [open])).toBe(
      '這張單已經取消，不再需要人手。',
    );
  });

  it('counts a need still marked in_progress — written before needs lost it — as short', () => {
    expect(
      formatRequestProgress('in_progress', [full, { status: 'in_progress' }]),
    ).toBe('2 件事：1 件已滿、1 件還缺人');
  });

  it('leaves out a need called off before deleting existed', () => {
    expect(
      formatRequestProgress('pending', [open, { status: 'canceled' }]),
    ).toBe('1 件事還缺人');
  });

  it('says it needs nobody when none of its needs is open, whatever its status says', () => {
    expect(formatRequestProgress('in_progress', [full])).toBe(DONE);
  });
});

function row(overrides: Partial<MyTicketRow> = {}): MyTicketRow {
  return {
    uuid: 'ticket-1',
    title: '光復鄉清淤',
    status: 'in_progress',
    createdAt: '2026-09-30T06:05:00Z',
    tasks: [full, open],
    ...overrides,
  };
}

describe('readMyRequests', () => {
  it('reads each request for its row: title, status, when it was filed and how far it got', () => {
    expect(readMyRequests([row()])).toEqual([
      {
        ticketUuid: 'ticket-1',
        title: '光復鄉清淤',
        status: 'in_progress',
        createdAt: '建立於 9/30 14:05',
        progress: '2 件事：1 件已滿、1 件還缺人',
      },
    ]);
  });

  it('keeps the order the server sends — newest first', () => {
    const rows = [row({ uuid: 'newer' }), row({ uuid: 'older' })];

    expect(readMyRequests(rows).map((request) => request.ticketUuid)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('says nothing of when a request with no time on it was filed', () => {
    expect(readMyRequests([row({ createdAt: null })])[0].createdAt).toBeNull();
  });
});
