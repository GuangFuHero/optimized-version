import { describe, expect, it, vi } from 'vitest';

import { createSharedRefresh } from './shared-refresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSharedRefresh', () => {
  it('refreshes once for requests that arrive together with the same token', async () => {
    const pending = deferred<string>();
    const refresh = vi.fn(() => pending.promise);
    const shared = createSharedRefresh(refresh, { reuseForMs: 30_000 });

    const first = shared('rt-1');
    const second = shared('rt-1');
    pending.resolve('pair-2');

    expect(await first).toBe('pair-2');
    expect(await second).toBe('pair-2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('hands the same pair to a request that still carries the spent token, for a while', async () => {
    let now = 0;
    const refresh = vi.fn(async () => 'pair-2');
    const shared = createSharedRefresh(refresh, {
      reuseForMs: 30_000,
      now: () => now,
    });

    await shared('rt-1');
    now = 29_000;

    expect(await shared('rt-1')).toBe('pair-2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes again once that while is over', async () => {
    let now = 0;
    const refresh = vi.fn(async () => 'pair');
    const shared = createSharedRefresh(refresh, {
      reuseForMs: 30_000,
      now: () => now,
    });

    await shared('rt-1');
    now = 31_000;
    await shared('rt-1');

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps no failure: the next request tries again', async () => {
    const refresh = vi
      .fn<(token: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce('pair-2');
    const shared = createSharedRefresh(refresh, { reuseForMs: 30_000 });

    await expect(shared('rt-1')).rejects.toThrow('refused');
    expect(await shared('rt-1')).toBe('pair-2');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps sessions apart: different tokens refresh on their own', async () => {
    const refresh = vi.fn(async (token: string) => `pair-for-${token}`);
    const shared = createSharedRefresh(refresh, { reuseForMs: 30_000 });

    const [a, b] = await Promise.all([shared('rt-a'), shared('rt-b')]);

    expect([a, b]).toEqual(['pair-for-rt-a', 'pair-for-rt-b']);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
