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
 * the session (`shouldReloadForSessionChange`) leaves this tab to its own reload instead of adding
 * one.
 */
export function markSigningOutHere(): void {
  signingOutHere = true;
}

/** Signing out here did not go through: the session goes on, and its end is news again. */
export function unmarkSigningOutHere(): void {
  signingOutHere = false;
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
 * This tab is signed out now — the backend cleared both cookies in its answer (ADR-328) —
 * so it carries on as a guest: the other tabs are told, and read the session again,
 * and this one leaves for `href` or reloads where it is. A whole-page load, not client-side
 * navigation: urql's cache lives in the page and must not go on showing what the signed-in person
 * could see.
 */
export function continueSignedOut(href?: string): void {
  markSigningOutHere();
  broadcastAuthChange('signed-out');

  if (href) {
    window.location.assign(href);
  } else {
    window.location.reload();
  }
}

/**
 * The proxy says the session has ended: reload where the person is, now a guest — as signing out
 * does, rather than sending them to the login page — with word for the next page to say why. Runs
 * once per tab, however many requests come back marked at the same time.
 */
export function endExpiredSession(): void {
  if (signingOutHere) {
    return;
  }

  markSessionExpired(sessionStorageOrNull());
  continueSignedOut();
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
