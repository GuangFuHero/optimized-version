// SPDX-License-Identifier: GPL-3.0-only
import API_ENDPOINTS from '../../../endpoints';
import requestAsync from '../../../request-async';

async function logoutAsync(accessToken: string) {
  return requestAsync<void>(API_ENDPOINTS.auth.logout, {
    method: 'POST',
    accessToken,
  });
}

export default logoutAsync;
