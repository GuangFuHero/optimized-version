import API_ENDPOINTS from '../../../endpoints';
import { requestFormAsync } from '../../../request-async';
import type { ITokenPair } from '../../../types';

async function loginAsync(
  username: string,
  password: string,
  grant_type = 'password',
) {
  const body = new URLSearchParams({
    username,
    password,
    grant_type,
  });

  return requestFormAsync<ITokenPair>(API_ENDPOINTS.auth.login, body, {
    method: 'POST',
  });
}

export default loginAsync;
