import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IAuthIdentifierPayload } from '../../../types';

async function addContactAsync(
  accessToken: string,
  payload: IAuthIdentifierPayload,
) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.contacts, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default addContactAsync;
