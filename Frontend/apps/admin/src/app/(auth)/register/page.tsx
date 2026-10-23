import { AuthShell, RegisterFormClient } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '註冊 - 島嶼守望',
  description: '註冊島嶼守望帳號',
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <RegisterFormClient />
      </AuthShell>
    </Suspense>
  );
}
