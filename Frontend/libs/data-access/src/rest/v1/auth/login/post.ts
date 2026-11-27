// SPDX-License-Identifier: GPL-3.0-only
import API_ENDPOINTS from '../../../endpoints';
import { formBody } from '../../../form-body';
import { requestFormAsync } from '../../../request-async';
import type { ITokenPair } from '../../../types';

async function loginAsync(
  username: string,
  password: string,
  grant_type = 'password',
) {
  const body = formBody({
    username,
    password,
    grant_type,
  });

  return requestFormAsync<ITokenPair>(API_ENDPOINTS.auth.login, body, {
    method: 'POST',
  });
}

export default loginAsync;
