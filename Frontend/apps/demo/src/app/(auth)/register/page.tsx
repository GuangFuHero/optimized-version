import { AuthShell } from '@rescue-frontend/modules';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import RegisterForm from '../../../modules/auth/login/register-form.client';

export const metadata: Metadata = {
  title: '註冊 - 島嶼守望',
  description: '註冊島嶼守望帳號',
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell>
        <RegisterForm />
      </AuthShell>
    </Suspense>
  );
}
