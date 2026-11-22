// SPDX-License-Identifier: GPL-3.0-only
import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { ISetPasswordPayload } from '../../../types';

async function setPasswordAsync(
  accessToken: string,
  payload: ISetPasswordPayload,
) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.setPassword, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default setPasswordAsync;
