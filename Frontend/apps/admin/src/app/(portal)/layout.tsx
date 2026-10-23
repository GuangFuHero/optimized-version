import { AdminShell } from '@rescue-frontend/modules';
import { authCookieNames } from '@rescue-frontend/modules/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await cookies()).has(authCookieNames().access)) {
    redirect('/login?callbackUrl=/');
  }
  return <AdminShell>{children}</AdminShell>;
}
