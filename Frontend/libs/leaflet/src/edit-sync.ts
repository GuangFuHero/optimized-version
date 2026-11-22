'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

export const DEFAULT_UNDO_MS = 5000;

const EMPTY_PENDING = Object.fromEntries<never>([]);
Object.setPrototypeOf(EMPTY_PENDING, null);
Object.freeze(EMPTY_PENDING);

export interface EditWriteContext {
  /** True when the page is leaving. Forward it to fetch where supported. */
  keepalive: boolean;
}

export interface EditWrite<Result> {
  persist: (context: EditWriteContext) => Promise<Result>;
  onSuccess?: (result: Result) => void;
  onError: (cause: unknown, context: EditWriteContext) => void;
  onCancel?: () => void;
}

export interface HeldEdit {
  deadline: number;
  /** Removes a waiting edit. After the deadline, commits it and returns false. */
  undo: () => boolean;
  /** Sends this edit now. Repeated calls have no effect. */
  commit: () => void;
}

export interface EditSync<Edit> {
  /** Edits stay here while they wait and while their requests are in flight. */
  pending: Readonly<Partial<Record<string, Edit>>>;
  save: <Result>(
    key: string,
    edit: Edit,
    write: EditWrite<Result>,
  ) => HeldEdit | null;
  /** Cancel waiting edits and keep tracking requests that have already started. */
  cancelWaiting: () => boolean;
  /** Drop queued edits and disregard in-flight results when the save scope ends. */
  reset: () => boolean;
}

interface Entry<Edit> {
  edit: Edit;
  waiting: boolean;
  commit: (keepalive: boolean) => void;
  cancel: () => void;
}

function createEditStore<Edit>(undoMs: number) {
  const entries = new Map<string, Entry<Edit>>();
  const listeners = new Set<() => void>();
  let pending: EditSync<Edit>['pending'] = EMPTY_PENDING;

  const publish = () => {
    const next = Object.fromEntries(
      [...entries].map(([key, { edit }]) => [key, edit]),
    );
    Object.setPrototypeOf(next, null);
    pending = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  const save: EditSync<Edit>['save'] = (key, edit, write) => {
    if (entries.has(key)) return null;

    const deadline = Date.now() + undoMs;
    const remove = () => {
      if (entries.get(key) !== entry) return false;

      entries.delete(key);
      publish();
      return true;
    };
    const persist = async (context: EditWriteContext) => {
      let result: Awaited<ReturnType<typeof write.persist>>;
      try {
        result = await write.persist(context);
      } catch (cause) {
        if (remove()) write.onError(cause, context);
        return;
      }
      if (remove()) write.onSuccess?.(result);
    };
    const commit = (keepalive: boolean) => {
      if (!entry.waiting || entries.get(key) !== entry) return;

      entry.waiting = false;
      window.clearTimeout(timer);
      void persist({ keepalive });
    };
    const timer = window.setTimeout(() => commit(false), undoMs);
    const entry: Entry<Edit> = {
      edit,
      waiting: true,
      commit,
      cancel() {
        window.clearTimeout(timer);
        write.onCancel?.();
      },
    };
    entries.set(key, entry);
    publish();

    return {
      deadline,
      commit: () => commit(false),
      undo() {
        if (!entry.waiting || entries.get(key) !== entry) return false;
        if (Date.now() >= deadline) {
          commit(false);
          return false;
        }
        window.clearTimeout(timer);
        return remove();
      },
    };
  };

  const discard = (includeInFlight: boolean) => {
    const waiting = [...entries].filter(([, entry]) => entry.waiting);
    if (includeInFlight) {
      if (entries.size === 0) return false;
      entries.clear();
    } else {
      if (waiting.length === 0) return false;
      for (const [key] of waiting) entries.delete(key);
    }
    publish();
    for (const [, entry] of waiting) entry.cancel();
    return waiting.length > 0;
  };

  return {
    save,
    cancelWaiting: () => discard(false),
    reset: () => discard(true),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => pending,
    getServerSnapshot: () => EMPTY_PENDING,
    beforeUnload(event: BeforeUnloadEvent) {
      if ([...entries.values()].some((entry) => entry.waiting)) {
        event.preventDefault();
        event.returnValue = '';
      }
    },
    pageHide() {
      for (const entry of [...entries.values()]) entry.commit(true);
    },
  };
}

/** Mount above the map if pending edits should survive a change of route. */
export function useEditSync<Edit>({
  undoMs = DEFAULT_UNDO_MS,
}: { undoMs?: number } = {}): EditSync<Edit> {
  const [store] = useState(() => createEditStore<Edit>(undoMs));
  const pending = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => {
    window.addEventListener('beforeunload', store.beforeUnload);
    window.addEventListener('pagehide', store.pageHide);
    return () => {
      window.removeEventListener('beforeunload', store.beforeUnload);
      window.removeEventListener('pagehide', store.pageHide);
      store.reset();
    };
  }, [store]);

  return {
    pending,
    save: store.save,
    cancelWaiting: store.cancelWaiting,
    reset: store.reset,
  };
}
