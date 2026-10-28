/**
 * 操作紀錄 / 團隊紀錄 from `GET /admin/audit-logs` (Spec/026, ADR-358). A row is a raw trigger
 * snapshot — table, INSERT/UPDATE/DELETE, the row's old and new values — so this turns the rows
 * the member pages care about into one sentence each. Names are looked up from what the page
 * already loaded; an unknown uuid reads as 「某位使用者」 rather than a uuid.
 */

import type { components } from '@rescue-frontend/data-access/openapi';

import {
  ROLE_DISPLAY_NAMES,
  TEAM_TYPE_DISPLAY_NAMES,
} from '../../constants/roles';
import { INVITE_VALID_HOURS } from './invite';

export type AuditLogItem = components['schemas']['AuditLogItem'];

export type AuditCategory = 'team' | 'member' | 'request' | 'qr' | 'other';

/** The tables behind each filter chip; the backend filters by one `table` at a time. */
export const AUDIT_CATEGORY_TABLE: Record<
  Exclude<AuditCategory, 'other'>,
  string
> = {
  team: 'teams',
  member: 'user_role_assign',
  request: 'role_requests',
  qr: 'team_invites',
};

/** What 全部 keeps: changes to teams and the people in them, not tickets or stations. */
export const MEMBER_AUDIT_TABLES: ReadonlySet<string> = new Set([
  'teams',
  'user_role_assign',
  'user_permission_assign',
  'role_requests',
  'team_invites',
  'team_zone_assign',
]);

export interface AuditLookups {
  userName: (uuid: string) => string | undefined;
  teamName: (uuid: string) => string | undefined;
  roleName: (uuid: string) => string | undefined;
}

export interface AuditEntry {
  uuid: string;
  at: string;
  actor: string;
  action: string;
  category: AuditCategory;
  /** `null` for a platform-wide entry. */
  teamName: string | null;
  danger: boolean;
}

type Values = Record<string, unknown>;

function str(values: Values | null | undefined, key: string): string | null {
  const value = values?.[key];
  return typeof value === 'string' && value ? value : null;
}

const SOMEONE = '某位使用者';

function roleLabel(name: string | undefined): string | null {
  if (!name) return null;
  return ROLE_DISPLAY_NAMES.get(name) ?? name;
}

/** `government` and `ngo` name a type of team, not a role (ADR-049). */
function requestedRoleLabel(role: string | null): string {
  if (role === 'government') return TEAM_TYPE_DISPLAY_NAMES.get('gov') ?? role;
  if (role === 'ngo') return TEAM_TYPE_DISPLAY_NAMES.get('ngo') ?? role;
  return roleLabel(role ?? undefined) ?? '後台人員';
}

interface Described {
  action: string;
  category: AuditCategory;
  teamUuid: string | null;
  danger?: boolean;
}

function describeTeam(item: AuditLogItem): Described {
  const before = item.old_values;
  const after = item.new_values;
  const name = str(after, 'name') ?? str(before, 'name') ?? '';
  const base = { category: 'team' as const, teamUuid: item.row_id };
  if (item.action === 'INSERT')
    return { ...base, action: `建立團隊「${name}」` };
  if (item.action === 'DELETE') {
    return { ...base, action: `刪除團隊「${name}」`, danger: true };
  }
  const status = str(after, 'status');
  if (status !== str(before, 'status')) {
    return status === 'suspended'
      ? { ...base, action: `暫停團隊「${name}」`, danger: true }
      : { ...base, action: `恢復團隊「${name}」` };
  }
  const oldName = str(before, 'name');
  if (oldName && oldName !== name) {
    return { ...base, action: `將團隊「${oldName}」改名為「${name}」` };
  }
  return { ...base, action: `編輯團隊「${name}」的資料` };
}

/**
 * A role grant. Changing someone's team role deletes the old grant and adds the new one
 * (`grant_team_role`), so a promotion reads as two entries: 撤除 then 設為.
 */
function describeGrant(item: AuditLogItem, lookups: AuditLookups): Described {
  const values = item.new_values ?? item.old_values;
  const user = lookups.userName(str(values, 'user_uuid') ?? '') ?? SOMEONE;
  const role = roleLabel(lookups.roleName(str(values, 'role_uuid') ?? ''));
  const teamUuid = str(values, 'team_uuid');
  const team = teamUuid ? (lookups.teamName(teamUuid) ?? '某團隊') : null;
  const removed = item.action === 'DELETE';
  const category: AuditCategory = 'member';

  if (team) {
    return {
      category,
      teamUuid,
      danger: removed,
      action: removed
        ? `撤除 ${user} 在「${team}」的${role ?? '團隊角色'}`
        : `將 ${user} 設為「${team}」的${role ?? '成員'}`,
    };
  }
  return {
    category,
    teamUuid: null,
    danger: removed,
    action: removed
      ? `撤銷 ${user} 的${role ?? '平台角色'}`
      : `指派 ${user} 為${role ?? '平台角色'}`,
  };
}

function describeRequest(item: AuditLogItem, lookups: AuditLookups): Described {
  const before = item.old_values;
  const after = item.new_values ?? before;
  const applicant = lookups.userName(str(after, 'created_by') ?? '') ?? SOMEONE;
  const teamUuid =
    str(after, 'team_uuid') ?? str(after, 'granted_team_uuid') ?? null;
  const team = teamUuid ? (lookups.teamName(teamUuid) ?? '某團隊') : null;
  const newTeam = str(after, 'new_team_name');
  const target = team
    ? `加入「${team}」`
    : newTeam
      ? `建立新團隊「${newTeam}」`
      : `成為${requestedRoleLabel(str(after, 'requested_role'))}`;
  const base = { category: 'request' as const, teamUuid };

  if (item.action === 'INSERT') {
    return {
      ...base,
      action: str(after, 'invite_uuid')
        ? `${applicant} 透過邀請連結申請${target}`
        : `${applicant} 申請${target}`,
    };
  }
  const status = str(after, 'status');
  if (status !== str(before, 'status')) {
    if (status === 'approved') {
      return { ...base, action: `核准 ${applicant} 申請${target}` };
    }
    if (status === 'rejected') {
      const note = str(after, 'review_note');
      return {
        ...base,
        danger: true,
        action: `拒絕 ${applicant} 申請${target}${note ? `｜理由：${note}` : ''}`,
      };
    }
    if (status === 'withdrawn') {
      return { ...base, action: `${applicant} 撤回申請${target}` };
    }
  }
  return { ...base, action: `更新 ${applicant} 的申請` };
}

function describeRow(item: AuditLogItem, lookups: AuditLookups): Described {
  const values = item.new_values ?? item.old_values;
  switch (item.table_name) {
    case 'teams':
      return describeTeam(item);
    case 'user_role_assign':
      return describeGrant(item, lookups);
    case 'role_requests':
      return describeRequest(item, lookups);
    case 'team_invites':
      return {
        category: 'qr',
        teamUuid: str(values, 'team_uuid'),
        action: `產生成員邀請 QR（${INVITE_VALID_HOURS} 小時）`,
      };
    case 'team_zone_assign': {
      const teamUuid = str(values, 'team_uuid');
      return {
        category: 'team',
        teamUuid,
        action:
          item.action === 'DELETE' ? '移除團隊的責任區' : '指派責任區給團隊',
      };
    }
    case 'user_permission_assign': {
      const user = lookups.userName(str(values, 'user_uuid') ?? '') ?? SOMEONE;
      return {
        category: 'member',
        teamUuid: str(values, 'team_uuid'),
        action: `調整 ${user} 的個別權限`,
      };
    }
    default:
      return {
        category: 'other',
        teamUuid: null,
        action: `${{ INSERT: '新增', UPDATE: '修改', DELETE: '刪除' }[item.action] ?? item.action} ${item.table_name} 資料`,
      };
  }
}

/** The actor's name; with none, the identity they acted as, else the system itself. */
function actorOf(item: AuditLogItem, lookups: AuditLookups): string {
  const name = item.user_uuid ? lookups.userName(item.user_uuid) : undefined;
  if (name) return name;
  const identity = item.context?.['identity'] as Values | undefined;
  const role = roleLabel(str(identity, 'role') ?? undefined);
  const team = str(identity, 'team');
  if (role) return team ? `${team} · ${role}` : role;
  return item.user_uuid ? SOMEONE : '系統';
}

export function describeAuditEntry(
  item: AuditLogItem,
  lookups: AuditLookups,
): AuditEntry {
  const described = describeRow(item, lookups);
  return {
    uuid: item.uuid,
    at: item.created_at,
    actor: actorOf(item, lookups),
    action: described.action,
    category: described.category,
    teamName: described.teamUuid
      ? (lookups.teamName(described.teamUuid) ?? null)
      : null,
    danger: described.danger ?? false,
  };
}
