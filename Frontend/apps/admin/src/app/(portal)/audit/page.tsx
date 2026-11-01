import { DedupReviewPage } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '重複審核 - 島嶼守望管理平台',
  description: '島嶼守望管理平台重複審核',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DedupReviewPage />
    </Suspense>
  );
}
