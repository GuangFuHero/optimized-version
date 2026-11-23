// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { Alert, Box, CircularProgress } from '@mui/material';
import { useCurrentUser } from '@rescue-frontend/data-access';
import { useEffect } from 'react';

import { loadPage } from '../../route/navigate';
import { ACCOUNT_SECURITY_SIGN_IN_HREF } from '../../route/paths';
import { AccountSecurityClient } from './account-security.client';

/**
 * `/account/security` when the server found the access token in need of a refresh it cannot make
 * (`READ_IN_BROWSER`): the account is read here instead, through the proxy, which refreshes it.
 */
export function AccountSecurityInBrowser() {
  const {
    data: user,
    isError,
    isFetchedAfterMount,
  } = useCurrentUser({
    refetchOnMount: 'always',
  });
  // Signed out after all: the refresh was refused, and the backend cleared the cookies.
  const signedOut = isFetchedAfterMount && !isError && user === null;
  // The refresh could not happen just now (503): still signed in, so no login page.
  const failed = isFetchedAfterMount && isError;

  useEffect(() => {
    if (signedOut) {
      loadPage(ACCOUNT_SECURITY_SIGN_IN_HREF);
    }
  }, [signedOut]);

  if (failed) {
    return (
      <Alert severity="error">暫時無法讀取帳號資料，請稍後重新整理。</Alert>
    );
  }

  if (isFetchedAfterMount && user) {
    return (
      <AccountSecurityClient
        userId={user.uuid}
        contacts={user.contacts ?? []}
        loginMethods={user.login_methods ?? []}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress />
    </Box>
  );
}
