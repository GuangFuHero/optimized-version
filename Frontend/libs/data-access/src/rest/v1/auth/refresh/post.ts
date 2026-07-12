import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IRefreshPayload, ITokenPair } from '../../../types';

async function refreshAsync(payload: IRefreshPayload) {
  return requestJsonAsync<ITokenPair>(API_ENDPOINTS.auth.refresh, {
    method: 'POST',
    body: payload,
  });
}

export default refreshAsync;
