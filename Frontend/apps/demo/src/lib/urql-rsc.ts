import { createUrqlClient } from '@rescue-frontend/data-access';
import { cache } from 'react';
import { getServerBackendAccessTokenAsync } from './server-backend-auth';
import { SITE_REALM_HEADERS } from './site-realm';

export const getServerUrqlClient = cache(async () => {
  const accessToken = await getServerBackendAccessTokenAsync();

  return createUrqlClient({
    runtime: 'server',
    authToken: accessToken,
    headers: SITE_REALM_HEADERS,
  });
});
