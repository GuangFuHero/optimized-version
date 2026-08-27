import { AsyncLocalStorage } from 'node:async_hooks';

import { setClientIpResolver } from './request-async';

/**
 * Carries the browser's IP across a server-side request so outbound backend calls can forward it.
 *
 * The backend rate-limits per caller IP, but every call it sees originates from this server. Without
 * forwarding, all users share one allowance. Threading a parameter through every data-access
 * function would touch ~18 signatures and every call site, so the IP rides here instead.
 *
 * Server-only. This module imports `node:async_hooks`, so it must never reach a client bundle —
 * which is why it is not exported from the package barrel and lives behind
 * `@rescue-frontend/data-access/server`. `requestAsync` stays free of node imports and reads the IP
 * through the resolver registered below.
 */
const clientIpStorage = new AsyncLocalStorage<string>();

setClientIpResolver(() => clientIpStorage.getStore());

/** Run `handler` with `clientIp` attached to every backend call it makes. */
export function runWithClientIp<T>(
  clientIp: string | undefined,
  handler: () => T,
): T {
  return clientIp ? clientIpStorage.run(clientIp, handler) : handler();
}

/**
 * Pick the browser's IP out of an inbound request's headers.
 *
 * Only `CF-Connecting-IP` is trusted, because Cloudflare is the one hop that *overwrites* it.
 *
 * `X-Forwarded-For` deliberately is not. Cloudflare **appends** to it, and the browser controls
 * whatever it already contained — so `xff.split(',')[0]` is a value the caller chose, and reading it
 * would let anyone pick their own rate-limit bucket and rotate it per request. Returning nothing
 * instead costs only per-caller accuracy: the backend falls back to the peer address, callers share
 * one allowance, and the limit still holds.
 *
 * A deployment behind something other than Cloudflare has to add its own header here, set by a hop
 * that overwrites rather than appends.
 */
export function resolveClientIp(headers: {
  get(name: string): string | null | undefined;
}) {
  return headers.get('cf-connecting-ip')?.trim() || undefined;
}
