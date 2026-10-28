import type { Metadata } from 'next';
import { TeamInvitePage } from '@rescue-frontend/modules';

export const metadata: Metadata = {
  title: '加入團隊 - 島嶼守望',
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TeamInvitePage token={token} />;
}
