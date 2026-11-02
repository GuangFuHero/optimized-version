/**
 * The keys still busy once `key` reports `busy`. The set itself comes back when nothing changes,
 * so a repeated report never re-renders.
 */
export function withBusyKey(
  keys: ReadonlySet<string>,
  key: string,
  busy: boolean,
): ReadonlySet<string> {
  if (keys.has(key) === busy) return keys;
  const next = new Set(keys);
  if (busy) next.add(key);
  else next.delete(key);
  return next;
}
