import { describe, expect, it } from 'vitest';

import {
  describeAuditEntry,
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
    ).toMatchObject({ action: '指派 王小明 為資料稽核員', teamName: null });
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
});
