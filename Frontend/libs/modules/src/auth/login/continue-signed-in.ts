'use client';

import { broadcastAuthChange } from '../../session/auth-broadcast';

/**
 * After the backend signed this browser in: the other tabs are told (one signed in as someone else
 * reloads), and this one goes on to `path`. A whole-page load, not client-side navigation, as
 * `continueSignedOut` does: urql's cache lives in the page and still holds what the guest was
 * shown — a need this person already took would still offer 接這筆.
 */
export function continueSignedIn(path: string): void {
  broadcastAuthChange('signed-in');
  window.location.assign(path);
}
