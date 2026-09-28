import { AuthShell, ForgotPasswordFormClient } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '忘記密碼 - 島嶼守望',
  description: '重新取得島嶼守望帳號的重設驗證碼',
};

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <ForgotPasswordFormClient />
      </AuthShell>
    </Suspense>
  );
}
