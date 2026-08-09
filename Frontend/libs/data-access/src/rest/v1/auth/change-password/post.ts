import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IChangePasswordPayload } from '../../../types';

async function changePasswordAsync(
  accessToken: string,
  payload: IChangePasswordPayload,
) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.changePassword, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default changePasswordAsync;
