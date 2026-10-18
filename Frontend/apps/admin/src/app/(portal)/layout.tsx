import { AdminShell } from '@rescue-frontend/modules';
import { getServerAuthSession } from '@rescue-frontend/modules/server';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  if (!session) redirect('/login?callbackUrl=/');
  return <AdminShell>{children}</AdminShell>;
}
