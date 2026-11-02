import { describe, expect, it } from 'vitest';

import { withBusyKey } from './busy-keys';

describe('withBusyKey', () => {
  it('adds a key that turns busy and drops one that settles', () => {
    const busy = withBusyKey(new Set(), 'assign:k1', true);
    expect([...busy]).toEqual(['assign:k1']);
    expect([...withBusyKey(busy, 'assign:k1', false)]).toEqual([]);
  });

  it('keeps the others busy while one settles', () => {
    const keys = new Set(['add', 'assign:k1']);
    expect([...withBusyKey(keys, 'add', false)]).toEqual(['assign:k1']);
  });

  it('hands the same set back when nothing changes', () => {
    const keys: ReadonlySet<string> = new Set(['add']);
    expect(withBusyKey(keys, 'add', true)).toBe(keys);
    expect(withBusyKey(keys, 'unassign', false)).toBe(keys);
  });
});
