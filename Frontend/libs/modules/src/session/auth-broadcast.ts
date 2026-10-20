/**
 * Tells this browser's other tabs that someone signed in or out here. next-auth used to do this for
 * us (its sign-out broadcast); since the login moved to the backend the
 * cookies change under every tab at once, but nothing else tells them, so they would go on showing
 * what the signed-in person could see. The session hook listens and reads `/users/me` again.
 *
 * Browser only; a no-op where `BroadcastChannel` is missing (the server, very old browsers), since a
 * tab that is not told still finds out on its next request or when it regains focus.
 */
const AUTH_CHANNEL = 'wg-auth';

export type AuthChange = 'signed-in' | 'signed-out';

export function broadcastAuthChange(change: AuthChange): void {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.postMessage(change);
  channel.close();
}

/** Calls `listener` whenever another tab (or another part of this one) broadcasts a change. */
export function onAuthChange(
  listener: (change: AuthChange) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined;
  }

  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === 'signed-in' || event.data === 'signed-out') {
      listener(event.data);
    }
  };

  return () => channel.close();
}
