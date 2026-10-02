import { describe, expect, it } from 'vitest';

import { roleRequestDrawerView, type RoleRequestRow } from './drawer-view';

function row(
  status: RoleRequestRow['status'],
  overrides: Partial<RoleRequestRow> = {},
): RoleRequestRow {
  return {
    uuid: `${status}-1`,
    requestedRole: 'data_auditor',
    reason: '協助檢查重複通報',
    status,
    reviewNote: null,
    createdAt: '2026-09-30T09:00:00+00:00',
    closedAt: null,
    ...overrides,
  };
}

describe('roleRequestDrawerView', () => {
  it('shows only the application that waits, and no form (AC-RE-106)', () => {
    const pending = row('pending');

    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: false,
        canApply: false,
        requests: [pending, row('rejected')],
      }),
    ).toEqual({
      kind: 'pending',
      pending,
    });
  });

  it('shows the form under the last rejection and its reply, so the same one is not sent again (AC-RE-107)', () => {
    const rejected = row('rejected', { reviewNote: '請附上單位證明後再申請' });

    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: false,
        canApply: true,
        requests: [rejected],
      }),
    ).toEqual({
      kind: 'form',
      lastRejected: rejected,
      paused: false,
    });
  });

  it('shows no card for a withdrawal, even with an older rejection behind it', () => {
    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: false,
        canApply: true,
        requests: [row('withdrawn'), row('rejected')],
      }),
    ).toEqual({ kind: 'form', lastRejected: null, paused: false });
  });

  it('shows a plain form to someone who never applied', () => {
    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: false,
        canApply: true,
        requests: [],
      }),
    ).toEqual({
      kind: 'form',
      lastRejected: null,
      paused: false,
    });
  });

  it('says applications are paused when nothing waits and applying is switched off', () => {
    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: false,
        canApply: false,
        requests: [],
      }),
    ).toEqual({
      kind: 'form',
      lastRejected: null,
      paused: true,
    });
  });

  it('shows the approval and no form once the applicant holds a back-office identity', () => {
    const approved = row('approved');

    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: true,
        canApply: false,
        requests: [approved, row('rejected')],
      }),
    ).toEqual({ kind: 'granted', approved });
  });

  it('shows no approval card to someone given the identity without applying for it', () => {
    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: true,
        canApply: false,
        requests: [row('withdrawn')],
      }),
    ).toEqual({ kind: 'granted', approved: null });
  });

  it('keeps a waiting application in view after an identity came another way, so it can be withdrawn', () => {
    const pending = row('pending');

    expect(
      roleRequestDrawerView({
        hasBackofficeIdentity: true,
        canApply: false,
        requests: [pending],
      }),
    ).toEqual({ kind: 'pending', pending });
  });
});
