import { StationManagementPage } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '資源站點管理 - 島嶼守望管理平台',
  description: '島嶼守望管理平台資源站點管理',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StationManagementPage />
    </Suspense>
  );
}
