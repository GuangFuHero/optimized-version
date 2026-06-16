import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IPasswordResetPayload } from '../../../types';

async function resetPasswordAsync(payload: IPasswordResetPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.resetPassword, {
    method: 'POST',
    body: payload,
  });
}

export default resetPasswordAsync;
