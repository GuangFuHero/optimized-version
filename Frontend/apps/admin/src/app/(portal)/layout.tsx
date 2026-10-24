import { AdminShell, NoBackOfficeAccess } from '@rescue-frontend/modules';
import {
  currentUserFromBackendAsync,
  NO_BACK_OFFICE_IDENTITY,
} from '@rescue-frontend/modules/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUserFromBackendAsync(
    (await headers()).get('cookie'),
    'admin',
  );
  if (!user) {
    redirect('/login?callbackUrl=/');
  }
  if (user === NO_BACK_OFFICE_IDENTITY) {
    return <NoBackOfficeAccess siteUrl={process.env.SITE_APP_URL} />;
  }
  return <AdminShell>{children}</AdminShell>;
}
