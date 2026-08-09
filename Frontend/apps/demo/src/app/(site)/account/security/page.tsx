import { Container } from '@mui/material';
import type { Metadata } from 'next';

import { redirect } from 'next/navigation';
import { getServerAuthSession } from '../../../../lib/auth-session';
import AccountSecurityClient from '../../../../modules/auth/session/account-security.client';

export const metadata: Metadata = {
  title: '帳號安全 - 島嶼守望',
  description: '管理你的登入密碼、聯絡方式與登入裝置',
};

export default async function AccountSecurityPage() {
  const session = await getServerAuthSession();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=%2Faccount%2Fsecurity');
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 4 } }}>
      <AccountSecurityClient
        currentIdentity={session.loginIdentity ?? session.user.email}
        currentProvider={session.authProvider}
      />
    </Container>
  );
}
