// SPDX-License-Identifier: GPL-3.0-only
import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { IIdTokenPayload } from '../../../../types';

async function linkGoogleAsync(accessToken: string, payload: IIdTokenPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.link.google, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default linkGoogleAsync;
