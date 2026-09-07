import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { ILinkIdTokenPayload } from '../../../../types';

async function linkLineAsync(accessToken: string, payload: ILinkIdTokenPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.link.line, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default linkLineAsync;
