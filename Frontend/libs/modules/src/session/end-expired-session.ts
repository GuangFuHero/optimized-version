'use client';

import { broadcastAuthChange } from './auth-broadcast';
import { isSessionExpiredResponse, markSessionExpired } from './expiry';

let signingOutHere = false;

/** This tab is already signing out, so a session that turns signed-out is its own doing. */
export function isSigningOutHere(): boolean {
  return signingOutHere;
}

/**
 * Say so before signing out here — 登出 from the menu, or an ended session — so the watch on
 * the session (`shouldReloadForSignOut`) leaves this tab to its own reload instead of adding one.
 */
export function markSigningOutHere(): void {
  signingOutHere = true;
}

/** The tab's sessionStorage, or none where the browser refuses it (blocked site data). */
export function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The proxy says the session has ended: reload where the person is, now a guest — as signing out
 * does, rather than sending them to the login page. A reload, not client-side navigation: urql's
 * cache lives in the page and must not go on showing what the signed-in person could see. Runs once
 * per tab, however many requests come back marked at the same time.
 *
 * Nothing to sign out of here: the backend cleared both cookies in the answer that ended the session
 * (backend login design §4). Only the other tabs still need telling; they read the session again and
 * reload as guests.
 */
export function endExpiredSession(): void {
  if (signingOutHere) {
    return;
  }

  markSigningOutHere();
  markSessionExpired(sessionStorageOrNull());
  broadcastAuthChange('signed-out');
  window.location.reload();
}

/**
 * `fetch` for the site's urql clients: hands the response on as it is, after noticing the proxy's
 * mark (`SESSION_HEADER`). Does nothing on the server.
 */
export const sessionExpiryFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (
    typeof window !== 'undefined' &&
    isSessionExpiredResponse(response.headers)
  ) {
    endExpiredSession();
  }

  return response;
};
