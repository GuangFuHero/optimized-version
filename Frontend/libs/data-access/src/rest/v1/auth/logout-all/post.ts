import API_ENDPOINTS from '../../../endpoints';
import requestAsync from '../../../request-async';

async function logoutAllAsync(accessToken: string) {
  return requestAsync<void>(API_ENDPOINTS.auth.logoutAll, {
    method: 'POST',
    accessToken,
  });
}

export default logoutAllAsync;
