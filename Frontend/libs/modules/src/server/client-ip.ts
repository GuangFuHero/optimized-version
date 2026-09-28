import {
  resolveClientIp,
  runWithClientIp,
} from '@rescue-frontend/data-access/server';
import { headers } from 'next/headers';

/**
 * Run `handler` with the browser's IP attached, so any backend call it makes is rate-limited
 * against the real caller instead of this server.
 *
 * Every backend call originating on the server needs this. Without it the backend sees only this
 * container's address and every user shares one allowance — the failure is invisible until enough
 * people are online at once, and then it looks like random logouts.
 *
 * Safe to nest (an inner scope just re-attaches the same IP) and safe outside a request scope,
 * where `headers()` throws and the handler simply runs unattributed, exactly as it did before.
 */
export async function withClientIpAsync<T>(handler: () => Promise<T>): Promise<T> {
  let clientIp: string | undefined;

  try {
    clientIp = resolveClientIp(await headers());
  } catch {
    // No request scope (background work, build-time render) — nothing to attribute the call to.
  }

  return runWithClientIp(clientIp, handler);
}
