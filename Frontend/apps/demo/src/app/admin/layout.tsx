import { redirect } from 'next/navigation';
// import { getServerAuthSession } from '../../lib/auth-session';
// import { PortalAdminLayout } from '../../modules/auth/session/authenticated-shell.client';

export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  redirect('/map');
  // const session = await getServerAuthSession();

  // if (!session?.accessToken) {
  //   redirect('/login?audience=admin');
  // }

  // return <PortalAdminLayout>{children}</PortalAdminLayout>;
}
