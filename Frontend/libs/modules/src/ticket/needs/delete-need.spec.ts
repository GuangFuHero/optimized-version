import { describe, expect, it } from 'vitest';

import { describeNeedDeletion } from './delete-need';
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

const GONE = '刪除後這筆需求會從單上拿掉，無法復原。';
const LAST_OPEN =
  '這是最後一筆還在找人的需求，刪除後這張單會變成「已完成」；之後還需要幫忙，可以再加一件。';

describe('describeNeedDeletion', () => {
  it('says only that it goes for good when nobody is on it and other needs are still open', () => {
    const target = need();
    const other = need({ uuid: 'need-2' });

    expect(describeNeedDeletion(target, [target, other])).toBe(GONE);
  });

  it('says how many people on it hear they need not go', () => {
    const target = need({ assignedCount: 3 });
    const other = need({ uuid: 'need-2' });

    expect(describeNeedDeletion(target, [target, other])).toBe(
      `${GONE}已承接的 3 位志工會收到通知，不用前往了。`,
    );
  });

  it('warns that the ticket turns 已完成 when it is the only need', () => {
    const target = need();

    expect(describeNeedDeletion(target, [target])).toBe(`${GONE}${LAST_OPEN}`);
  });

  it('warns the same when every other need has its people already', () => {
    const target = need({ assignedCount: 2 });
    const filled = need({
      uuid: 'need-2',
      status: 'fulfilled',
      assignedCount: 5,
    });

    expect(describeNeedDeletion(target, [target, filled])).toBe(
      `${GONE}已承接的 2 位志工會收到通知，不用前往了。${LAST_OPEN}`,
    );
  });

  it('does not warn for a need that has its people already: the ticket does not change for it', () => {
    const target = need({ status: 'fulfilled', assignedCount: 5 });

    expect(describeNeedDeletion(target, [target])).toBe(
      `${GONE}已承接的 5 位志工會收到通知，不用前往了。`,
    );
  });

  it('counts a need still marked in_progress — written before needs lost it — as open', () => {
    const target = need();
    const legacy = need({ uuid: 'need-2', status: 'in_progress' });

    expect(describeNeedDeletion(target, [target, legacy])).toBe(GONE);
  });

  it('reads the same whether or not the list it is given still holds the need', () => {
    const target = need();

    expect(describeNeedDeletion(target, [])).toBe(`${GONE}${LAST_OPEN}`);
  });
});
