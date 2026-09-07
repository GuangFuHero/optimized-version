import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { ILinkIdTokenPayload } from '../../../../types';

async function linkGoogleAsync(accessToken: string, payload: ILinkIdTokenPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.link.google, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default linkGoogleAsync;
