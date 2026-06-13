import { Stack } from '@mui/material';
import { AuthBrandHeader, AuthShell } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import ResetPasswordFormClient from '../../../modules/auth/login/reset-password-form.client';

export const metadata: Metadata = {
  title: '重設密碼 - 島嶼守望',
  description: '使用驗證碼重設島嶼守望帳號密碼',
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <Stack spacing={2} sx={{ width: '100%' }}>
          <AuthBrandHeader />

          <ResetPasswordFormClient />
        </Stack>
      </AuthShell>
    </Suspense>
  );
}
