import API_ENDPOINTS from '../../../../endpoints';
import requestAsync from '../../../../request-async';
import type { IUserSaltResponse } from '../../../../types';

async function getUserSaltAsync(username: string) {
  const data = await requestAsync<IUserSaltResponse>(
    API_ENDPOINTS.auth.salt(username),
  );

  return data.salt_frontend;
}

export default getUserSaltAsync;
