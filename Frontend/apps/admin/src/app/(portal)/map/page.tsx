import type { Metadata } from 'next';

import { AdminMapPageClient } from './admin-map-page.client';

export const metadata: Metadata = {
  title: '地圖 - 島嶼守望管理平台',
  description: '島嶼守望管理平台地圖檢視',
};

export default function Page() {
  return <AdminMapPageClient />;
}
