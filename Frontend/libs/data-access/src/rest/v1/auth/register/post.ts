import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IRegisterPayload } from '../../../types';

async function registerAsync(payload: IRegisterPayload) {
  return requestJsonAsync<void>(API_ENDPOINTS.auth.register, {
    method: 'POST',
    body: payload,
  });
}

export default registerAsync;
