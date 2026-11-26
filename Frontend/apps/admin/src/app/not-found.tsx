// SPDX-License-Identifier: GPL-3.0-only
import {
  AdminErrorPage,
  AdminShell,
  BACK_OFFICE_SIGN_IN_HREF,
  NoBackOfficeAccess,
} from '@rescue-frontend/modules';
import {
  currentUserFromBackendAsync,
  NO_BACK_OFFICE_IDENTITY,
} from '@rescue-frontend/modules/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function NotFound() {
  const user = await currentUserFromBackendAsync(
    (await headers()).get('cookie'),
    'admin',
  );
  if (!user) {
    redirect(BACK_OFFICE_SIGN_IN_HREF);
  }
  if (user === NO_BACK_OFFICE_IDENTITY) {
    return <NoBackOfficeAccess siteUrl={process.env.SITE_APP_URL} />;
  }

  return (
    <AdminShell notFound siteUrl={process.env.SITE_APP_URL}>
      <AdminErrorPage code="404" />
    </AdminShell>
  );
}
