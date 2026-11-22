// SPDX-License-Identifier: GPL-3.0-only
import type { components } from '@rescue-frontend/data-access/openapi';

import type { SessionStatus } from './expiry';

type UserResponse = components['schemas']['UserResponse'];

/** Who is signed in, as far as the pages need to know: the menu's name, a claim's or request's owner. */
export type AuthSessionUser = Pick<UserResponse, 'uuid' | 'name'>;

export interface AuthSession {
  status: SessionStatus;
  user: AuthSessionUser | null;
}

export function toAuthSession(user: AuthSessionUser | null): AuthSession {
  return user
    ? { status: 'authenticated', user: { uuid: user.uuid, name: user.name } }
    : { status: 'unauthenticated', user: null };
}
