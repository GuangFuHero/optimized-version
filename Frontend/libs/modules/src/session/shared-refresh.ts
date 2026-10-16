/**
 * One refresh per refresh token. The backend rotates a refresh token on use and reads any later use
 * as a replay — it revokes the session (backend `session_repository.py` `rotate`). Requests that
 * reach the server together in an access token's last seconds — the map's parallel queries, or
 * the proxy beside next-auth's own session read — each found the same refresh token, and all but
 * the first signed the person out (seen 10-01).
 *
 * So callers holding the same token share one refresh, and for `reuseForMs` after it settles a
 * request still carrying the spent token (its browser has not stored the new cookie yet) gets the
 * same pair instead of replaying. A failure is not kept: the next request tries again.
 *
 * Pure and import-free; the server keeps one instance per process. Several server instances would
 * each have their own, and would need a shared store instead.
 */
export interface SharedRefreshOptions {
  reuseForMs: number;
  now?: () => number;
}

interface Entry<T> {
  promise: Promise<T>;
  /** When it resolved; unset while still in flight. */
  settledAt?: number;
}

export function createSharedRefresh<T>(
  refresh: (refreshToken: string) => Promise<T>,
  { reuseForMs, now = Date.now }: SharedRefreshOptions,
): (refreshToken: string) => Promise<T> {
  const entries = new Map<string, Entry<T>>();

  const isStale = (entry: Entry<T>) =>
    entry.settledAt !== undefined && now() - entry.settledAt >= reuseForMs;

  return (refreshToken) => {
    // Spent tokens are never asked for again once their window passes: sweep them as we go.
    for (const [token, entry] of entries) {
      if (isStale(entry)) {
        entries.delete(token);
      }
    }

    const current = entries.get(refreshToken);

    if (current) {
      return current.promise;
    }

    const entry: Entry<T> = {
      promise: refresh(refreshToken).then(
        (value) => {
          entry.settledAt = now();
          return value;
        },
        (error: unknown) => {
          entries.delete(refreshToken);
          throw error;
        },
      ),
    };

    entries.set(refreshToken, entry);
    return entry.promise;
  };
}
