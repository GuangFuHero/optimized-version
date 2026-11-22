// SPDX-License-Identifier: GPL-3.0-only
import API_ENDPOINTS from '../../../endpoints';
import requestAsync from '../../../request-async';
import type { IUser } from '../../../types';

async function getCurrentUserAsync(accessToken: string) {
  return requestAsync<IUser>(API_ENDPOINTS.users.me, {
    accessToken,
  });
}

export default getCurrentUserAsync;
