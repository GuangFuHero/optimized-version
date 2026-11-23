// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { ApiError } from '@rescue-frontend/data-access';

import {
  continueSignedOut,
  endExpiredSession,
  markSigningOutHere,
  unmarkSigningOutHere,
} from '../../session/end-expired-session';
import { SITE_PATHS } from '../../route/paths';
import { logoutAllAsync, signOutAsync } from '../api/client';

export type SignOutOutcome = 'signed-out' | 'still-signed-in';

export type SignOutEverywhereOutcome =
  | 'signed-out'
  | 'session-ended'
  | 'not-confirmed';

/**
 * Says the person is still signed in: anything vaguer would let someone walk away from a shared
 * device believing the sign-out went through (as `session_store_unavailable` says elsewhere).
 */
export const SIGN_OUT_FAILED_MESSAGE =
  '登出失敗，你目前仍在登入狀態，請稍後再試一次。';

/**
 * 登出所有裝置 failed, and nothing says how far it got: the backend may have ended this session and
 * then stopped (its session store out of reach), or never got the request. Neither "signed out"
 * nor "still signed in" is known, so it says what to do instead of guessing.
 */
export const SIGN_OUT_EVERYWHERE_UNCONFIRMED_MESSAGE =
  '無法確認是否已登出所有裝置。請重新整理頁面，還在登入的話再試一次。';

/**
 * 登出 from the menu: the backend ends this browser's session and clears its cookies, and the tab
 * carries on as a guest (`continueSignedOut`). When the backend could not — its session store out
 * of reach (503), or no answer at all — the cookies are still there and so is the session: the tab
 * stays as it is, for the person to be told and try again.
 */
export async function signOutHereAsync(
  endSession: () => Promise<void> = signOutAsync,
): Promise<SignOutOutcome> {
  // Its own reload below; the watch on the session must not add another.
  markSigningOutHere();

  try {
    await endSession();
  } catch {
    unmarkSigningOutHere();
    return 'still-signed-in';
  }

  continueSignedOut();
  return 'signed-out';
}

/**
 * 登出所有裝置: the backend ends every session of the account, this one too, and the tab leaves for
 * the sign-in page.
 * - A 401 says this session had already ended before the request: the tab goes on as for any
 *   ended session (`endExpiredSession`), a guest with word of why.
 * - Any other failure leaves it unknown how far the backend got: the page stays, for the person
 *   to be told so (`SIGN_OUT_EVERYWHERE_UNCONFIRMED_MESSAGE`) rather than told either way.
 */
export async function signOutEverywhereAsync(
  endSessions: () => Promise<void> = logoutAllAsync,
): Promise<SignOutEverywhereOutcome> {
  // Its own leaving for /login below: another request coming back signed out meanwhile, as the
  // sessions end, must not reload the tab first.
  markSigningOutHere();

  try {
    await endSessions();
  } catch (error) {
    unmarkSigningOutHere();
    if (error instanceof ApiError && error.status === 401) {
      endExpiredSession();
      return 'session-ended';
    }
    return 'not-confirmed';
  }

  continueSignedOut(SITE_PATHS.login);
  return 'signed-out';
}
