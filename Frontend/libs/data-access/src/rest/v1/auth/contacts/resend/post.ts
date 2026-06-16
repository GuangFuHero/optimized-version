import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { IAuthIdentifierPayload } from '../../../../types';

async function resendContactAsync(
  accessToken: string,
  payload: IAuthIdentifierPayload,
) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.resendContact, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default resendContactAsync;
