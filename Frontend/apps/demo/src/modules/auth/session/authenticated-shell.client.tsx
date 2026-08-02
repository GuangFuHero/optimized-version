'use client';

import type { ReactNode } from 'react';

import { AdminLayout } from '@rescue-frontend/modules';
import { signOut } from 'next-auth/react';

export function PortalAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminLayout onSignOut={() => signOut({ callbackUrl: '/login?audience=admin' })}>
      {children}
    </AdminLayout>
  );
}
