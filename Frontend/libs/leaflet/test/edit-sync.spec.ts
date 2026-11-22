// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useEditSync,
  type EditSync,
  type EditWrite,
  type HeldEdit,
} from '../src/edit-sync.ts';

let container: HTMLDivElement;
let root: Root;
let sync: EditSync<string>;

function TestQueue() {
  const queue = useEditSync<string>();
  useEffect(() => {
    sync = queue;
  }, [queue]);
  return null;
}

function write<Result>(
  request: Promise<Result>,
  overrides: Partial<EditWrite<Result>> = {},
): EditWrite<Result> {
  return { persist: vi.fn(() => request), onError: vi.fn(), ...overrides };
}

function deferred<Result>() {
  let settle: (result: Result) => void = () => {
    throw new Error('The test request has no resolver.');
  };
  let fail: (cause: Error) => void = () => {
    throw new Error('The test request has no rejecter.');
  };
  const promise = new Promise<Result>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

/** Saves an edit on the hook's queue and lets React paint its pending state. */
async function save(
  key: string,
  edit: string,
  request: EditWrite<string>,
): Promise<HeldEdit | null> {
  let held: HeldEdit | null = null;
  await act(async () => {
    held = sync.save(key, edit, request);
  });
  return held;
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(TestQueue));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useEditSync', () => {
  it('keeps the first edit when the same key is saved twice in one tick', async () => {
    await act(async () => {
      expect(
        sync.save('area', 'first', write(Promise.resolve('ok'))),
      ).not.toBeNull();
      expect(
        sync.save('area', 'second', write(Promise.resolve('ok'))),
      ).toBeNull();
    });

    expect(sync.pending).toEqual({ area: 'first' });
  });

  it('keeps an in-flight edit pending, and a stale handle cannot undo the next one', async () => {
    const old = deferred<string>();
    const stale = await save('area', 'old', write(old.promise));
    if (!stale) throw new Error('The first edit should be queued.');
    stale.commit();
    expect(sync.pending).toEqual({ area: 'old' });
    expect(
      await save('area', 'duplicate', write(Promise.resolve('ok'))),
    ).toBeNull();

    await act(async () => old.settle('old result'));
    expect(sync.pending).toEqual({});

    const newer = await save(
      'area',
      'newer',
      write(deferred<string>().promise),
    );
    expect(newer).not.toBeNull();
    expect(sync.pending).toEqual({ area: 'newer' });
    expect(stale.undo()).toBe(false);
    expect(sync.pending).toEqual({ area: 'newer' });
  });

  it.each(['succeeds', 'fails'])(
    'lets a reset key be saved again and ignores the dropped request when it %s',
    async (outcome) => {
      const staleRequest = deferred<string>();
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const stale = await save(
        'area',
        'old',
        write(staleRequest.promise, { onSuccess, onError }),
      );
      if (!stale) throw new Error('The old identity should be able to save.');
      stale.commit();
      await act(async () => {
        expect(sync.reset()).toBe(false);
      });
      expect(sync.pending).toEqual({});

      const newerRequest = deferred<string>();
      const newer = await save('area', 'new', write(newerRequest.promise));
      expect(newer).not.toBeNull();
      expect(sync.pending).toEqual({ area: 'new' });

      await act(async () => {
        if (outcome === 'fails')
          staleRequest.fail(new Error('Old request failed'));
        else staleRequest.settle('old result');
      });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(sync.pending).toEqual({ area: 'new' });

      if (!newer) throw new Error('The new identity should be able to save.');
      newer.commit();
      expect(sync.pending).toEqual({ area: 'new' });
      await act(async () => newerRequest.settle('new result'));
      expect(sync.pending).toEqual({});
    },
  );
});
