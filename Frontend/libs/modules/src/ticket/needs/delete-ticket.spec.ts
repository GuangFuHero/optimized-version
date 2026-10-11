import { describe, expect, it } from 'vitest';

import { describeTicketDeletion, formatTicketNeedCount } from './delete-ticket';
import type { TicketNeed } from './need-claim';

function need(overrides: Partial<TicketNeed> = {}): TicketNeed {
  return {
    uuid: 'need-1',
    taskName: '清淤',
    taskType: 'hr',
    quantity: 5,
    status: 'pending',
    assignedCount: 0,
    myAssignment: null,
    ...overrides,
  };
}

describe('describeTicketDeletion', () => {
  it('says the ticket and every need on it go for good', () => {
    expect(describeTicketDeletion([need(), need({ uuid: 'need-2' })])).toBe(
      '刪除後這張單和底下的 2 筆需求都會拿掉，無法復原。',
    );
  });

  it('says only the ticket goes when it has no need left', () => {
    expect(describeTicketDeletion([])).toBe('刪除後這張單會拿掉，無法復原。');
  });

  it('says the people on its needs hear they need not go — without a count, since one may be on two', () => {
    expect(
      describeTicketDeletion([
        need({ assignedCount: 2 }),
        need({ uuid: 'need-2' }),
      ]),
    ).toBe(
      '刪除後這張單和底下的 2 筆需求都會拿掉，無法復原。已承接的志工會收到通知，不用前往了。',
    );
  });

  it('counts people on a need that has filled or stopped too', () => {
    expect(
      describeTicketDeletion([need({ status: 'fulfilled', assignedCount: 5 })]),
    ).toBe(
      '刪除後這張單和底下的 1 筆需求都會拿掉，無法復原。已承接的志工會收到通知，不用前往了。',
    );
  });
});

describe('formatTicketNeedCount', () => {
  it('counts the needs on the ticket, or says it has none', () => {
    expect(formatTicketNeedCount(3)).toBe('3 筆需求');
    expect(formatTicketNeedCount(0)).toBe('沒有需求');
  });
});
