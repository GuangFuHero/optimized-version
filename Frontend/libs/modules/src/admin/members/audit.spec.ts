import { describe, expect, it } from 'vitest';

import {
  describeAuditEntry,
  isDefaultRoleGrant,
  shouldReadOnForAll,
  type AuditLogItem,
  type AuditLookups,
} from './audit';

const names: Record<string, string> = {
  'u-lin': '林承翰',
  'u-wang': '王小明',
  't-ngo': '慈濟基金會',
  'r-admin': 'admin',
  'r-member': 'member',
  'r-auditor': 'data_auditor',
  'r-user': 'user',
};
const lookups: AuditLookups = {
  userName: (uuid) => (uuid.startsWith('u-') ? names[uuid] : undefined),
  teamName: (uuid) => (uuid.startsWith('t-') ? names[uuid] : undefined),
  roleName: (uuid) => (uuid.startsWith('r-') ? names[uuid] : undefined),
};

function row(overrides: Partial<AuditLogItem>): AuditLogItem {
  return {
    uuid: 'a-1',
    table_name: 'teams',
    action: 'INSERT',
    row_id: 't-ngo',
    old_values: null,
    new_values: null,
    user_uuid: 'u-lin',
    context: null,
    created_at: '2026-10-22T00:00:00Z',
    ...overrides,
  };
}

const describe1 = (overrides: Partial<AuditLogItem>) =>
  describeAuditEntry(row(overrides), lookups);

describe('describeAuditEntry — teams', () => {
  it('names who created the team, and files it under that team', () => {
    expect(
      describe1({ new_values: { name: '慈濟基金會', status: 'active' } }),
    ).toMatchObject({
      actor: '林承翰',
      action: '建立團隊「慈濟基金會」',
      category: 'team',
      teamName: '慈濟基金會',
      danger: false,
    });
  });

  it('reads a status change as suspending or restoring', () => {
    const before = { name: '慈濟基金會', status: 'active' };
    const after = { name: '慈濟基金會', status: 'suspended' };
    expect(
      describe1({ action: 'UPDATE', old_values: before, new_values: after }),
    ).toMatchObject({ action: '暫停團隊「慈濟基金會」', danger: true });
    expect(
      describe1({ action: 'UPDATE', old_values: after, new_values: before }),
    ).toMatchObject({ action: '恢復團隊「慈濟基金會」', danger: false });
  });

  it('reads a rename', () => {
    expect(
      describe1({
        action: 'UPDATE',
        old_values: { name: '慈濟', status: 'active' },
        new_values: { name: '慈濟基金會', status: 'active' },
      }).action,
    ).toBe('將團隊「慈濟」改名為「慈濟基金會」');
  });
});

describe('describeAuditEntry — role grants', () => {
  const grant = { user_uuid: 'u-wang', team_uuid: 't-ngo' };

  it('reads a team grant as setting a team role, and its removal as revoking it', () => {
    expect(
      describe1({
        table_name: 'user_role_assign',
        new_values: { ...grant, role_uuid: 'r-admin' },
      }),
    ).toMatchObject({
      action: '將 王小明 設為「慈濟基金會」的管理員',
      category: 'member',
      teamName: '慈濟基金會',
    });
    expect(
      describe1({
        table_name: 'user_role_assign',
        action: 'DELETE',
        old_values: { ...grant, role_uuid: 'r-member' },
      }),
    ).toMatchObject({
      action: '撤除 王小明 在「慈濟基金會」的成員',
      danger: true,
    });
  });

  it('reads a grant with no team as a platform role', () => {
    expect(
      describe1({
        table_name: 'user_role_assign',
        new_values: { user_uuid: 'u-wang', role_uuid: 'r-auditor' },
      }),
    ).toMatchObject({ action: '指派 王小明 為資料檢核員', teamName: null });
  });

  it('says 某位使用者 rather than show a uuid it cannot name', () => {
    expect(
      describe1({
        table_name: 'user_role_assign',
        new_values: {
          user_uuid: 'u-gone',
          role_uuid: 'r-gone',
          team_uuid: 't-ngo',
        },
      }).action,
    ).toBe('將 某位使用者 設為「慈濟基金會」的成員');
  });
});

describe('describeAuditEntry — requests and invites', () => {
  const asked = {
    created_by: 'u-wang',
    team_uuid: 't-ngo',
    requested_role: 'ngo',
    status: 'pending',
  };

  it('tells an invite scan from a form request', () => {
    expect(
      describe1({
        table_name: 'role_requests',
        user_uuid: 'u-wang',
        new_values: { ...asked, invite_uuid: 'i-1' },
      }).action,
    ).toBe('王小明 透過邀請連結申請加入「慈濟基金會」');
    expect(
      describe1({
        table_name: 'role_requests',
        new_values: { ...asked, team_uuid: null, new_team_name: '新的隊' },
      }).action,
    ).toBe('王小明 申請建立新團隊「新的隊」');
  });

  it('reads a rejection with its reason', () => {
    expect(
      describe1({
        table_name: 'role_requests',
        action: 'UPDATE',
        old_values: asked,
        new_values: { ...asked, status: 'rejected', review_note: '查無此人' },
      }),
    ).toMatchObject({
      action: '拒絕 王小明 申請加入「慈濟基金會」｜理由：查無此人',
      category: 'request',
      danger: true,
    });
  });

  it('reads a new invite as a QR entry', () => {
    expect(
      describe1({
        table_name: 'team_invites',
        new_values: { team_uuid: 't-ngo' },
      }),
    ).toMatchObject({
      action: '產生成員邀請 QR（24 小時）',
      category: 'qr',
      teamName: '慈濟基金會',
    });
  });
});

describe('describeAuditEntry — actor', () => {
  it('falls back to the identity snapshot, then to the system', () => {
    expect(
      describe1({
        user_uuid: 'u-gone',
        context: { identity: { role: 'admin', team: '慈濟基金會' } },
      }).actor,
    ).toBe('慈濟基金會 · 管理員');
    expect(describe1({ user_uuid: null }).actor).toBe('系統');
  });

  it('names an applicant not on the roster by the name on the request', () => {
    const entry = describe1({
      table_name: 'role_requests',
      user_uuid: 'u-new',
      context: { identity: { role: 'user' } },
      new_values: {
        created_by: 'u-new',
        applicant_name: '陳美玲',
        team_uuid: 't-ngo',
        status: 'pending',
      },
    });
    expect(entry.actor).toBe('陳美玲');
    expect(entry.action).toBe('陳美玲 申請加入「慈濟基金會」');
  });

  it('never names an actor 一般使用者', () => {
    expect(
      describe1({
        user_uuid: 'u-gone',
        context: { identity: { role: 'user' } },
      }).actor,
    ).toBe('某位使用者');
  });
});

describe('shouldReadOnForAll', () => {
  const state = {
    category: 'all' as const,
    shown: 0,
    hasNextPage: true,
    failed: false,
    pagesRead: 1,
    pageCap: 10,
  };

  it('reads on under 全部 while nothing is shown and more pages exist', () => {
    expect(shouldReadOnForAll(state)).toBe(true);
  });

  it('stops once a page fails, so a failing page is not refetched over and over', () => {
    expect(shouldReadOnForAll({ ...state, failed: true })).toBe(false);
  });

  it('stops for another category, once something is shown, at the last page or at the cap', () => {
    expect(shouldReadOnForAll({ ...state, category: 'team' })).toBe(false);
    expect(shouldReadOnForAll({ ...state, shown: 1 })).toBe(false);
    expect(shouldReadOnForAll({ ...state, hasNextPage: false })).toBe(false);
    expect(shouldReadOnForAll({ ...state, pagesRead: 10 })).toBe(false);
  });
});

describe('isDefaultRoleGrant', () => {
  const grant = (values: Record<string, unknown>) =>
    row({ table_name: 'user_role_assign', new_values: values });

  it('picks out a grant of the default platform role, which 操作紀錄 leaves out', () => {
    expect(
      isDefaultRoleGrant(
        grant({ user_uuid: 'u-wang', role_uuid: 'r-user' }),
        lookups,
      ),
    ).toBe(true);
  });

  it('keeps every other grant, the revoke of a data auditor among them', () => {
    expect(
      isDefaultRoleGrant(
        grant({ user_uuid: 'u-wang', role_uuid: 'r-auditor' }),
        lookups,
      ),
    ).toBe(false);
    expect(
      isDefaultRoleGrant(
        grant({
          user_uuid: 'u-wang',
          role_uuid: 'r-member',
          team_uuid: 't-ngo',
        }),
        lookups,
      ),
    ).toBe(false);
  });
});
