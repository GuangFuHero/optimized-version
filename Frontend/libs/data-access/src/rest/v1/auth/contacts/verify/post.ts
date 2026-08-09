import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { IVerifyPayload } from '../../../../types';

async function verifyContactAsync(accessToken: string, payload: IVerifyPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.verifyContact, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default verifyContactAsync;
