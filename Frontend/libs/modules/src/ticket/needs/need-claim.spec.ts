import { describe, expect, it } from 'vitest';

import {
  formatNeedHeadcount,
  formatNeedQuota,
  resolveNeedClaim,
  type TicketNeed,
} from './need-claim';

function need(overrides: Partial<TicketNeed> = {}): TicketNeed {
  return {
    uuid: 'need-1',
    taskName: '清淤',
    taskType: 'hr',
    quantity: 3,
    status: 'pending',
    assignedCount: 1,
    myAssignment: null,
    ...overrides,
  };
}

const SIGNED_IN = { isAuthenticated: true, ticketStatus: 'pending' };

describe('resolveNeedClaim', () => {
  it('offers an open need to a signed-in volunteer', () => {
    expect(resolveNeedClaim(need(), SIGNED_IN)).toEqual({
      kind: 'open',
      label: '接這筆',
      action: 'claim',
    });
  });

  it('turns a volunteer away once as many have claimed as the need asks for', () => {
    const full = { kind: 'full', label: '已滿', action: null };

    expect(resolveNeedClaim(need({ quantity: 3, assignedCount: 3 }), SIGNED_IN)).toEqual(full);
    // Over-sent from before a coordinator was capped too (Q38, reversing d847624): still full.
    expect(resolveNeedClaim(need({ quantity: 3, assignedCount: 4 }), SIGNED_IN)).toEqual(full);
  });

  it('never fills a need whose requester did not say how many', () => {
    // Unlike the prototype, which counts a missing quantity as 1 (site-actions.jsx:417-420).
    expect(resolveNeedClaim(need({ quantity: null, assignedCount: 5 }), SIGNED_IN).kind).toBe(
      'open',
    );
  });

  it('asks a guest to sign in first', () => {
    expect(resolveNeedClaim(need(), { isAuthenticated: false, ticketStatus: 'pending' })).toEqual({
      kind: 'guest',
      label: '登入後接',
      action: 'sign-in',
    });
  });

  it('does not send a guest to sign in for a need that is already full', () => {
    const fullNeed = need({ quantity: 2, assignedCount: 2 });

    expect(resolveNeedClaim(fullNeed, { isAuthenticated: false, ticketStatus: 'pending' }).kind).toBe(
      'full',
    );
  });

  it('shows a volunteer the need they claimed, even once it has its people', () => {
    const claimed = { kind: 'mine', label: '已承接', action: null };
    const mine = { myAssignment: { uuid: 'assignment-1' } };

    expect(resolveNeedClaim(need({ ...mine, assignedCount: 1 }), SIGNED_IN)).toEqual(claimed);
    // Filled by the claims or stopped by its requester, and they still go (Q26).
    expect(
      resolveNeedClaim(need({ ...mine, assignedCount: 3, status: 'fulfilled' }), SIGNED_IN),
    ).toEqual(claimed);
  });

  it('closes a need that was called off, and says so over the viewer’s own claim', () => {
    const mine = { myAssignment: { uuid: 'assignment-1' } };

    expect(resolveNeedClaim(need({ status: 'canceled' }), SIGNED_IN)).toEqual({
      kind: 'canceled',
      label: '已取消',
      action: null,
    });
    // 「不用去了」outranks「我接過」— a volunteer who claimed it must not read it as still on.
    expect(resolveNeedClaim(need({ ...mine, status: 'canceled' }), SIGNED_IN).kind).toBe('canceled');
  });

  it('calls a need that has its people fulfilled, not done — nobody on it has gone yet', () => {
    const fulfilled = { kind: 'fulfilled', label: '已滿足需求', action: null };

    expect(resolveNeedClaim(need({ status: 'fulfilled' }), SIGNED_IN)).toEqual(fulfilled);
    // Full too, as a fulfilled need now always is (Q37, Q39): its status says more than 已滿.
    expect(
      resolveNeedClaim(need({ status: 'fulfilled', quantity: 3, assignedCount: 3 }), SIGNED_IN),
    ).toEqual(fulfilled);
  });

  it('closes the needs of a ticket withdrawn or with none open, as the backend refuses them', () => {
    // A ticket's status follows its needs now (Q44) and only deleting it cancels it (Q43), but one
    // closed by hand before then left its needs pending: the ticket's own status still decides.
    const mine = { myAssignment: { uuid: 'assignment-1' } };
    const withdrawn = { isAuthenticated: true, ticketStatus: 'cancelled' };
    const completed = { isAuthenticated: true, ticketStatus: 'completed' };

    expect(resolveNeedClaim(need(), withdrawn).kind).toBe('canceled');
    expect(resolveNeedClaim(need(mine), withdrawn).kind).toBe('canceled');
    expect(resolveNeedClaim(need(), completed)).toEqual({
      kind: 'fulfilled',
      label: '已滿足需求',
      action: null,
    });
    // As on a fulfilled need, a volunteer still sees their own claim on a completed ticket (Q26).
    expect(resolveNeedClaim(need(mine), completed).kind).toBe('mine');
    expect(resolveNeedClaim(need(), { isAuthenticated: true, ticketStatus: 'in_progress' }).kind).toBe(
      'open',
    );
  });
});

describe('formatNeedQuota', () => {
  it('counts the places taken against the places asked for, and how many are still missing', () => {
    expect(formatNeedQuota(need({ quantity: 3, assignedCount: 1 }), 'open')).toEqual({
      text: '1/3 · 缺 2',
      fraction: 1 / 3,
    });
  });

  it('says a need is full instead of missing nobody, and never overfills the bar', () => {
    expect(formatNeedQuota(need({ quantity: 3, assignedCount: 3 }), 'full')).toEqual({
      text: '3/3 已滿',
      fraction: 1,
    });
    // Over-sent from before coordinators were capped (Q38): the count is the truth, the bar just
    // stays full.
    expect(formatNeedQuota(need({ quantity: 3, assignedCount: 4 }), 'full')).toEqual({
      text: '4/3 已滿',
      fraction: 1,
    });
  });

  it('says a quantity was never given, and counts heads without a bar to fill', () => {
    expect(formatNeedQuota(need({ quantity: null, assignedCount: 2 }), 'open')).toEqual({
      text: '未填數量 · 已 2 人',
      fraction: null,
    });
  });

  it('stops asking for people once a need is called off or has its people', () => {
    const halfway = need({ quantity: 3, assignedCount: 1 });

    expect(formatNeedQuota(halfway, 'canceled')).toEqual({ text: '1/3', fraction: 1 / 3 });
    expect(formatNeedQuota(halfway, 'fulfilled')).toEqual({ text: '1/3', fraction: 1 / 3 });
  });
});

describe('formatNeedHeadcount', () => {
  it('tells the volunteer about to confirm how many are going and how many are still missing', () => {
    expect(formatNeedHeadcount(need({ quantity: 3, assignedCount: 1 }), 'open')).toBe(
      '目前 1/3 人，還缺 2 位',
    );
  });

  it('says a need is full rather than missing nobody — or a negative number when over-sent', () => {
    expect(formatNeedHeadcount(need({ quantity: 3, assignedCount: 3 }), 'full')).toBe(
      '目前 3/3 人，已滿',
    );
    expect(formatNeedHeadcount(need({ quantity: 3, assignedCount: 4 }), 'full')).toBe(
      '目前 4/3 人，已滿',
    );
  });

  it('counts heads without inventing a total the requester never gave', () => {
    expect(formatNeedHeadcount(need({ quantity: null, assignedCount: 2 }), 'open')).toBe(
      '目前 2 人（未填數量）',
    );
  });

  it('stops asking for people once the need closed under the dialog', () => {
    // A refused claim reloads the need (Q29), and a canceled one is missing nobody.
    expect(formatNeedHeadcount(need({ quantity: 3, assignedCount: 1 }), 'canceled')).toBe(
      '目前 1/3 人',
    );
  });
});
