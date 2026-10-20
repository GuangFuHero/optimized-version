import { ApiError } from '@rescue-frontend/data-access';
import { describe, expect, it } from 'vitest';

import { resolveAuthErrorMessage } from './error-messages';

const FALLBACK = '操作失敗，請稍後再試。';

describe('resolveAuthErrorMessage', () => {
  // The backend answers a request that needs a sign-in and came without a token with
  // `credentials_invalid` too: outside the login form it means the session is gone, not a typo.
  it('reads a credentials_invalid as a sign-in that is gone', () => {
    const cause = new ApiError(401, 'Not authenticated', 'credentials_invalid');

    expect(resolveAuthErrorMessage(cause, FALLBACK)).toBe(
      '登入已失效，請重新登入。',
    );
  });
});
