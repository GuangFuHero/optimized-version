import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdminMapPageClient } from './admin-map-page.client';

export const metadata: Metadata = {
  title: '地圖 - 島嶼守望管理平台',
  description: '島嶼守望管理平台地圖檢視',
};

// The page reads `?zone=` with `useSearchParams`, which needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminMapPageClient />
    </Suspense>
  );
}
