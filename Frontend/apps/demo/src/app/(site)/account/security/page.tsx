import { Container } from '@mui/material';
import type { Metadata } from 'next';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountSecurityClient } from '@rescue-frontend/modules';
import { currentUserFromBackendAsync } from '@rescue-frontend/modules/server';

export const metadata: Metadata = {
  title: '帳號安全 - 島嶼守望',
  description: '管理你的登入密碼、聯絡方式與登入裝置',
};

export default async function AccountSecurityPage() {
  // The middleware (`proxy.ts`) has refreshed a spent access token before this renders.
  const user = await currentUserFromBackendAsync(
    (await headers()).get('cookie'),
  );

  if (!user) {
    redirect('/login?callbackUrl=%2Faccount%2Fsecurity');
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 4 } }}>
      <AccountSecurityClient
        contacts={user.contacts ?? []}
        loginMethods={user.login_methods ?? []}
      />
    </Container>
  );
}
