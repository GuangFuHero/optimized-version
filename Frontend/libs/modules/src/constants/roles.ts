import type { components } from '@rescue-frontend/data-access/openapi';

export const ROLE_DISPLAY_NAMES = new Map<
  components['schemas']['IdentityOption']['role'],
  string
>([
  ['user', '一般使用者'],
  ['data_auditor', '資料稽核員'],
  ['super_admin', '超級管理員'],
  ['admin', '管理員'],
  ['member', '成員'],
]);

export const ROLE_DESCRIPTIONS = new Map<
  components['schemas']['IdentityOption']['role'],
  string
>([
  ['data_auditor', '資料檢核 · 重複單標記與合併'],
  ['super_admin', '全平台管理 · 成員與權限 · 平台角色審核'],
  ['admin', '管理本隊成員 · 審核加入申請 · 團隊紀錄'],
  ['member', '檢視本隊 · 回報任務進度'],
]);

export const TEAM_TYPE_DISPLAY_NAMES = new Map<
  components['schemas']['TeamResponse']['type'],
  string
>([
  ['gov', '政府'],
  ['ngo', '非政府組織'],
]);

export function identityLabel(
  identity: components['schemas']['IdentityOption'],
) {
  const role = ROLE_DISPLAY_NAMES.get(identity.role) ?? identity.role;
  return identity.team ? `${identity.team} · ${role}` : role;
}
