import {
  ApiError,
  responseData,
  type createRestClient,
} from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import type { SessionStatus } from './expiry';

type UserResponse = components['schemas']['UserResponse'];

/** Who is signed in, as far as the pages need to know: the menu's name, a claim's or request's owner. */
export type AuthSessionUser = Pick<UserResponse, 'uuid' | 'name'>;

export interface AuthSession {
  status: SessionStatus;
  user: AuthSessionUser | null;
}

/**
 * The browser's sign-in state, read from the backend's `/users/me` through the app's own proxy
 * (which refreshes a spent access token on the way). Since the login moved to the backend the
 * cookies are `HttpOnly`: asking the backend is the only way a page can tell. A 401 is a guest;
 * anything else that fails is thrown, as no word either way.
 */
export async function readAuthSessionAsync(
  client: ReturnType<typeof createRestClient>,
): Promise<AuthSession> {
  try {
    const user = await client
      .GET('/api/v1/users/me', { cache: 'no-store' })
      .then(responseData);
    return {
      status: 'authenticated',
      user: { uuid: user.uuid, name: user.name },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: 'unauthenticated', user: null };
    }
    throw error;
  }
}
