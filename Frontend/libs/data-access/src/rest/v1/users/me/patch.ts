import API_ENDPOINTS from '../../../endpoints';
import { requestJsonAsync } from '../../../request-async';
import type { IUser, IUserUpdatePayload } from '../../../types';

async function patchCurrentUserAsync(
  accessToken: string,
  payload: IUserUpdatePayload,
) {
  return requestJsonAsync<IUser>(API_ENDPOINTS.users.me, {
    method: 'PATCH',
    accessToken,
    body: payload,
  });
}

export default patchCurrentUserAsync;
