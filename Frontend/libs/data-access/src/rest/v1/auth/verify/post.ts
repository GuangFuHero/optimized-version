import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { ITokenPair, IVerifyPayload } from '../../../types';

async function verifyAsync(payload: IVerifyPayload) {
  return requestJsonAsync<ITokenPair>(API_ENDPOINTS.auth.verify, {
    method: 'POST',
    body: payload,
  });
}

export default verifyAsync;
