import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { IIdTokenPayload } from '../../../../types';

async function linkLineAsync(accessToken: string, payload: IIdTokenPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.link.line, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default linkLineAsync;
