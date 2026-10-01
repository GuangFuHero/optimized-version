'use client';

import { signOut } from 'next-auth/react';

import { isSessionExpiredResponse, markSessionExpired } from './expiry';

let signingOutHere = false;

/** This tab is already signing out, so a session that turns signed-out is its own doing. */
export function isSigningOutHere(): boolean {
  return signingOutHere;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The proxy says the session has ended: sign out and reload where the person is, now a guest
 * (`note/session-expiry-spec.md` Q3). A reload, not client-side navigation: urql's cache lives in
 * the page and must not go on showing what the signed-in person could see. Runs once per tab,
 * however many requests come back marked at the same time.
 */
export async function endExpiredSession(): Promise<void> {
  if (signingOutHere) {
    return;
  }

  signingOutHere = true;
  markSessionExpired(sessionStorageOrNull());

  try {
    // Clears next-auth's own view of the session and tells the other tabs (S4).
    await signOut({ redirect: false });
  } finally {
    window.location.reload();
  }
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
    void endExpiredSession();
  }

  return response;
};
