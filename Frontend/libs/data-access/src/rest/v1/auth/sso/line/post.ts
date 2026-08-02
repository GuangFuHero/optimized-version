import API_ENDPOINTS from '../../../../endpoints';
import { requestJsonAsync } from '../../../../request-async';
import type { IIdTokenPayload, ITokenPair } from '../../../../types';

async function lineSsoAsync(payload: IIdTokenPayload) {
  return requestJsonAsync<ITokenPair>(API_ENDPOINTS.auth.sso.line, {
    method: 'POST',
    body: payload,
  });
}

export default lineSsoAsync;
