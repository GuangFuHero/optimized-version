import { AdminErrorPage, AdminShell } from '@rescue-frontend/modules';
import { authCookieNames } from '@rescue-frontend/modules/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function NotFound() {
  if (!(await cookies()).has(authCookieNames().access)) {
    redirect('/login?callbackUrl=/');
  }

  return (
    <AdminShell notFound>
      <AdminErrorPage code="404" />
    </AdminShell>
  );
}
