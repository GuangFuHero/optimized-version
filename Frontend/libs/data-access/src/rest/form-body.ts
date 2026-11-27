// SPDX-License-Identifier: GPL-3.0-only
/**
 * An `application/x-www-form-urlencoded` body from `fields`, in the order given. Each name and value
 * is percent-encoded, so `&`, `=`, `+` and `%` in a value reach the server as written.
 */
export function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}
