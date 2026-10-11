import type { components } from '@rescue-frontend/data-access/openapi';

export const ROLE_DISPLAY_NAMES = new Map<
  components['schemas']['IdentityOption']['role'],
  string
>([
  ['user', '一般使用者'],
  ['data_auditor', '資料稽核員'],
  ['super_admin', '超級管理員'],
  ['admin', '團隊管理員'],
  ['member', '團隊成員'],
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
