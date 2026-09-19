import { Icons } from '@rescue-frontend/ui';

import type { SiteModule } from './types';

/**
 * 地圖／列表兩個模組的顯示名稱與圖示。
 *
 * 側欄與控制列的「地圖 ⇄ 列表」切換鈕共用這一份，兩處的叫法與圖示才不會各自分岔。
 * 存的是圖示元件而不是元素，讓各處自己決定尺寸。
 */
export const SITE_MODULE_META: Record<
  SiteModule,
  { label: string; Icon: typeof Icons.map }
> = {
  map: { label: '地圖', Icon: Icons.map },
  list: { label: '列表', Icon: Icons.dataGrid },
};
