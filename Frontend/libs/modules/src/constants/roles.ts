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
