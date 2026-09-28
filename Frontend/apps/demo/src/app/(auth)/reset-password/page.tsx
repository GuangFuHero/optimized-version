import { AuthShell, ResetPasswordFormClient } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '重設密碼 - 島嶼守望',
  description: '使用驗證碼重設島嶼守望帳號密碼',
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <ResetPasswordFormClient />
      </AuthShell>
    </Suspense>
  );
}
