'use client';

import {
  continueSignedOut,
  markSigningOutHere,
  unmarkSigningOutHere,
} from '../../session/end-expired-session';
import { signOutAsync } from '../api/client';

export type SignOutOutcome = 'signed-out' | 'still-signed-in';

/**
 * Says the person is still signed in: anything vaguer would let someone walk away from a shared
 * device believing the sign-out went through (as `session_store_unavailable` says elsewhere).
 */
export const SIGN_OUT_FAILED_MESSAGE =
  '登出失敗，你目前仍在登入狀態，請稍後再試一次。';

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
