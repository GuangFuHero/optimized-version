import { Stack } from '@mui/material';
import { AuthBrandHeader, AuthShell } from '@rescue-frontend/modules';
import { Metadata } from 'next';
import { Suspense } from 'react';
import LoginForm from '../../../modules/auth/login/login-form.client';

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
        <Stack spacing={2} sx={{ width: '100%' }}>
          <AuthBrandHeader />

          <LoginForm />

          {/* <AuthFooterLinks items={FOOTER_LINKS} /> */}
        </Stack>
      </AuthShell>
    </Suspense>
  );
}
