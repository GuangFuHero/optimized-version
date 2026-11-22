// SPDX-License-Identifier: GPL-3.0-only
import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IAuthIdentifierPayload } from '../../../types';

async function resendVerificationAsync(payload: IAuthIdentifierPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.resendVerification, {
    method: 'POST',
    body: payload,
  });
}

export default resendVerificationAsync;
