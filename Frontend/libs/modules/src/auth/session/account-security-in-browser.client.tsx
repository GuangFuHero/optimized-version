'use client';

import { Alert, Box, CircularProgress } from '@mui/material';
import { ApiError } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';
import { useEffect, useState } from 'react';

import { getCurrentUserAsync } from '../api/client';
import { AccountSecurityClient } from './account-security.client';

type UserResponse = components['schemas']['UserResponse'];

const SIGN_IN_HREF = '/login?callbackUrl=%2Faccount%2Fsecurity';

/**
 * `/account/security` when the server found the access token in need of a refresh it cannot make
 * (`READ_IN_BROWSER`): the account is read here instead, through the proxy, which refreshes it.
 */
export function AccountSecurityInBrowser() {
  const [user, setUser] = useState<UserResponse>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getCurrentUserAsync().then(setUser, (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        // Signed out after all: the refresh was refused, and the backend cleared the cookies.
        window.location.assign(SIGN_IN_HREF);
      } else {
        // The refresh could not happen just now (503): still signed in, so no login page.
        setFailed(true);
      }
    });
  }, []);

  if (user) {
    return (
      <AccountSecurityClient
        contacts={user.contacts ?? []}
        loginMethods={user.login_methods ?? []}
      />
    );
  }

  if (failed) {
    return (
      <Alert severity="error">暫時無法讀取帳號資料，請稍後重新整理。</Alert>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress />
    </Box>
  );
}
