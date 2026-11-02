import { TicketBoardPage } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '任務管理 - 島嶼守望管理平台',
  description: '島嶼守望管理平台任務管理',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TicketBoardPage />
    </Suspense>
  );
}
