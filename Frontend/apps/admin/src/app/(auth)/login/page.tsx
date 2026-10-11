import { AuthShell, LoginFormClient } from '@rescue-frontend/modules';
import { Metadata } from 'next';
import { Suspense } from 'react';

// TODO: Update the footer links when the actual pages are ready
// const FOOTER_LINKS = [
//   {
//     label: '隱私政策',
//     href: '/privacy',
//   },
//   {
//     label: '服務條款',
//     href: '/terms',
//   },
//   {
//     label: '支援',
//     href: '/support',
//   },
// ] as const;

export const metadata: Metadata = {
  title: '登入 - 島嶼守望',
  description: '登入島嶼守望 - 即時災情協作指揮平台',
};

export default function Index() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <LoginFormClient defaultCallbackUrl="/" />

        {/* <AuthFooterLinks items={FOOTER_LINKS} /> */}
      </AuthShell>
    </Suspense>
  );
}
