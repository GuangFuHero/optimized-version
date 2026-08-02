import { Stack } from '@mui/material';
import { AuthBrandHeader, AuthShell } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import ForgotPasswordFormClient from '../../../modules/auth/login/forgot-password-form.client';

export const metadata: Metadata = {
  title: '忘記密碼 - 島嶼守望',
  description: '重新取得島嶼守望帳號的重設驗證碼',
};

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <Stack spacing={2} sx={{ width: '100%' }}>
          <AuthBrandHeader />

          <ForgotPasswordFormClient />
        </Stack>
      </AuthShell>
    </Suspense>
  );
}
