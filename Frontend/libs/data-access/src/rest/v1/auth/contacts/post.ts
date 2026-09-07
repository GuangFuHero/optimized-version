import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IAddContactPayload } from '../../../types';

async function addContactAsync(
  accessToken: string,
  payload: IAddContactPayload,
) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.contacts, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export default addContactAsync;
