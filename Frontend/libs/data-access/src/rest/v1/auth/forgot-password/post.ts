import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IAuthIdentifierPayload } from '../../../types';

async function forgotPasswordAsync(payload: IAuthIdentifierPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.forgotPassword, {
    method: 'POST',
    body: payload,
  });
}

export default forgotPasswordAsync;
