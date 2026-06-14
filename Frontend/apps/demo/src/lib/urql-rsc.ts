import { createUrqlClient } from '@rescue-frontend/data-access';
import { cache } from 'react';
import { getServerBackendAccessTokenAsync } from './server-backend-auth';

export const getServerUrqlClient = cache(async () => {
  const accessToken = await getServerBackendAccessTokenAsync();

  return createUrqlClient({
    runtime: 'server',
    authToken: accessToken,
  });
});
