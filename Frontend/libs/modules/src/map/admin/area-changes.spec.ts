// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  endExpiredSession,
  SESSION_ENDING_EVENT,
  unmarkSigningOutHere,
} from '../../session/end-expired-session';
import {
  AdminAreaChangesProvider,
  useAdminAreaChanges,
  useCancelHeldAreaChanges,
  type AreaChanges,
} from './area-changes';
import { EMPTY_AREA_FORM, type DrawEditor } from './area-editor';
import { UNDO_MS } from './hold-request';

let container: HTMLDivElement;
let root: Root;
let latest: AreaChanges;
const createView = () => ({
  restoreDraft: vi.fn<(draft: DrawEditor) => boolean>(),
  highlightArea: vi.fn<(uuid: string) => void>(),
});
let view = createView();
/** The 登出 handler the account menu gets from the identity's holds. */
let cancelForSignOut: () => boolean;

/** The map view, which is the only reader of the identity-held draft and writes. */
function MapView() {
  const changes = useAdminAreaChanges();
  const { bindView } = changes;
  useEffect(() => bindView(view), [bindView]);
  useEffect(() => {
    latest = changes;
  }, [changes]);
  return null;
}

function SignOutControl() {
  const cancelHeldAreaChanges = useCancelHeldAreaChanges();
  useEffect(() => {
    cancelForSignOut = () => cancelHeldAreaChanges?.() ?? false;
  }, [cancelHeldAreaChanges]);
  return null;
}

/** The admin shell: the signed-in identity's holds, the map view, and the toasts they show. */
function shell(showingMapView: boolean) {
  return createElement(
    Fragment,
    null,
    createElement(
      AdminAreaChangesProvider,
      null,
      showingMapView ? createElement(MapView) : null,
      createElement(SignOutControl),
    ),
    createElement(Toaster),
  );
}

async function mountMap() {
  await act(async () => {
    root.render(shell(true));
  });
}

/** Its child goes away; the identity and everything it holds stay. */
async function unmountMapView() {
  await act(async () => {
    root.render(shell(false));
  });
}

/** A sign-out and the next sign-in: the provider and its store go, a new identity starts clean. */
async function nextIdentity() {
  await act(async () => root.unmount());
  container.remove();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await mountMap();
}

/** Sonner adds a toast on a zero-delay timer, so one reaches the screen after a turn. */
async function onScreen() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Presses 復原, the one button a held write's toast shows. */
async function pressUndo() {
  const button = container.querySelector<HTMLButtonElement>(
    'button[data-action]',
  );

  if (!button) {
    throw new Error('no 復原 button on screen');
  }

  await act(async () => button.click());
}

/** The undo deadline comes and goes: a write still held would be sent now. */
async function pastDeadline() {
  await act(async () => {
    vi.advanceTimersByTime(UNDO_MS);
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * The proxy's answer that the session has ended, which reloads the tab as a guest. jsdom cannot
 * reload, and says so on stderr: what the page hears and the reload it would have are noted
 * instead, in the order they come, so the run goes on as it would. The leave the browser makes
 * behind a reload (`pagehide`) comes with it, as early as it could.
 */
function endSession(): string[] {
  const page = window.location;
  const heard: string[] = [];
  const noteEnding = () => heard.push(SESSION_ENDING_EVENT);
  window.addEventListener(SESSION_ENDING_EVENT, noteEnding);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      reload: () => {
        heard.push('reload');
        window.dispatchEvent(new Event('pagehide'));
      },
    },
  });
  try {
    endExpiredSession();
  } finally {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: page,
    });
    window.removeEventListener(SESSION_ENDING_EVENT, noteEnding);
  }
  return heard;
}

function draft(points: DrawEditor['points'] = [[121.43, 23.67]]): DrawEditor {
  return { kind: 'draw', step: 'drawing', points, values: EMPTY_AREA_FORM };
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // The tab's own sign-out is one fact for the whole page; each test starts before it happened.
  unmarkSigningOutHere();
  vi.useFakeTimers();
  view = createView();
  view.restoreDraft.mockReturnValue(true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await mountMap();
});

afterEach(async () => {
  await act(async () => {
    toast.dismiss();
    await vi.advanceTimersByTimeAsync(UNDO_MS);
  });
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('area changes held with the identity', () => {
  it('keeps a held write across the map view unmounting, and refuses a second write to the same area', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const change = { kind: 'delete' as const };
    const message = '已刪除危險區「堤防潰口」';

    let held = false;
    await act(async () => {
      held = latest.hold({ uuid: 'area-1', change, message, send });
    });

    expect(held).toBe(true);
    expect(latest.pending['area-1']).toEqual(change);

    await act(async () => {
      latest.hold({ uuid: 'area-1', change, message: 'again', send });
    });
    // The refused write showed nothing of its own: the one toast is the first write's.
    expect(toast.getToasts()).toMatchObject([{ title: message }]);

    await unmountMapView();
    await mountMap();

    expect(latest.pending['area-1']).toEqual(change);
  });

  it('drops a held write on 復原 without sending it', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      latest.hold({
        uuid: 'area-1',
        change: { kind: 'delete' },
        message: '已刪除危險區「堤防潰口」',
        send,
      });
    });

    await onScreen();
    await pressUndo();

    expect(latest.pending).toEqual({});
    expect(send).not.toHaveBeenCalled();
    expect(toast.getToasts()).toEqual([]);
  });

  it('sends a held write at the deadline and clears it', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      latest.hold({
        uuid: 'area-1',
        change: { kind: 'delete' },
        message: '已刪除危險區「堤防潰口」',
        send,
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(false);
    expect(latest.pending).toEqual({});
  });

  it('drops a held write when 登出 cancels it, while the page is still up and the deadline ahead', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      latest.hold({
        uuid: 'area-1',
        change: { kind: 'delete' },
        message: '已刪除危險區「堤防潰口」',
        send,
      });
    });
    await onScreen();
    expect(toast.getToasts()).toMatchObject([
      { title: '已刪除危險區「堤防潰口」' },
    ]);

    let cancelled = false;
    await act(async () => {
      cancelled = cancelForSignOut();
    });

    // The write is gone and its 復原 offer with it, before any page or identity change.
    expect(cancelled).toBe(true);
    expect(latest.pending).toEqual({});
    expect(toast.getToasts()).toEqual([]);

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await pastDeadline();

    expect(send).not.toHaveBeenCalled();
    // Nothing was left to cancel, so 登出 has no reason to say it cancelled anything.
    expect(cancelForSignOut()).toBe(false);
  });

  it('cancels a held write when the identity goes, so it is never sent under the next one', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      latest.hold({
        uuid: 'area-1',
        change: { kind: 'delete' },
        message: '已刪除危險區「堤防潰口」',
        send,
      });
    });

    await nextIdentity();
    await pastDeadline();

    expect(send).not.toHaveBeenCalled();
    expect(latest.pending).toEqual({});
  });
});

describe('a session that ends while a write and a new area are held', () => {
  it('drops both, so neither is sent as the page goes, before the reload takes the page', async () => {
    const sendChange = vi.fn().mockResolvedValue(undefined);
    const sendDraft = vi.fn().mockResolvedValue('new-area');
    const held = draft();

    await act(async () => {
      latest.hold({
        uuid: 'area-1',
        change: { kind: 'delete' },
        message: '已刪除危險區「堤防潰口」',
        send: sendChange,
      });
      latest.holdDraft(held, {
        message: '已建立危險區「堤防潰口」',
        send: sendDraft,
      });
    });
    await onScreen();
    expect(toast.getToasts()).toHaveLength(2);

    let heard: string[] = [];
    await act(async () => {
      heard = endSession();
    });

    // The session ended: the page is told before it reloads, and no undo offer outlives it.
    expect(heard).toEqual([SESSION_ENDING_EVENT, 'reload']);
    expect(latest.pending).toEqual({});
    expect(latest.heldDraft).toBeNull();
    expect(toast.getToasts()).toEqual([]);
    // The leave that comes with the reload is behind it: nothing may be left to send by then.
    expect(sendChange).not.toHaveBeenCalled();
    expect(sendDraft).not.toHaveBeenCalled();

    // The deadline is the other moment a write still held would go.
    await pastDeadline();

    expect(sendChange).not.toHaveBeenCalled();
    expect(sendDraft).not.toHaveBeenCalled();
  });
});

describe('a new area held with the identity', () => {
  it('keeps the held draft across the map view unmounting, and takes it back on 復原', async () => {
    const send = vi.fn().mockResolvedValue('new-area');
    const held = draft();

    let accepted = false;
    await act(async () => {
      accepted = latest.holdDraft(held, {
        message: '已建立危險區「堤防潰口」',
        send,
      });
    });

    expect(accepted).toBe(true);
    expect(latest.heldDraft).toEqual(held);
    expect(latest.heldDraft?.points).toEqual(held.points);

    const previousView = view;
    await unmountMapView();
    view = createView();
    view.restoreDraft.mockReturnValue(true);
    await mountMap();

    expect(latest.heldDraft).toEqual(held);

    await onScreen();
    await pressUndo();

    expect(latest.heldDraft).toBeNull();
    expect(view.restoreDraft).toHaveBeenCalledExactlyOnceWith(held);
    expect(previousView.restoreDraft).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('holds one new area at a time across a remount', async () => {
    const send = vi.fn().mockResolvedValue('new-area');
    const held = draft();

    await act(async () => {
      latest.holdDraft(held, {
        message: '已建立危險區「堤防潰口」',
        send,
      });
    });

    await unmountMapView();
    await mountMap();

    let accepted = false;
    await act(async () => {
      accepted = latest.holdDraft(draft([[121.44, 23.68]]), {
        message: '第二個',
        send,
      });
    });

    expect(accepted).toBe(false);
    expect(latest.heldDraft).toEqual(held);
  });

  it('sends the draft at the deadline and clears it', async () => {
    const send = vi.fn().mockResolvedValue('new-area');

    await act(async () => {
      latest.holdDraft(draft(), {
        message: '已建立危險區「堤防潰口」',
        send,
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(false);
    expect(latest.heldDraft).toBeNull();
    expect(view.highlightArea).toHaveBeenCalledExactlyOnceWith('new-area');
  });

  it('keeps a recoverable draft when the server might have saved it', async () => {
    const held = draft();
    const send = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await act(async () => {
      latest.holdDraft(held, { message: '已建立區域', send });
    });
    await pastDeadline();

    expect(latest.heldDraft).toBeNull();
    expect(latest.recoverableDraft).toEqual(held);
    expect(view.restoreDraft).not.toHaveBeenCalled();
  });

  it.each([
    { outcome: 'the identity remains active', sessionEnds: false },
    { outcome: 'the session ends', sessionEnds: true },
  ])('handles a sent draft failing when $outcome', async ({ sessionEnds }) => {
    const held = draft();
    let rejectSave: () => void = () => {
      throw new Error('The draft was not sent.');
    };
    const send = vi.fn(
      () =>
        new Promise<string>((_, reject) => {
          rejectSave = () => reject(new TypeError('Failed to fetch'));
        }),
    );
    await act(async () => {
      latest.holdDraft(held, { message: '已建立區域', send });
    });
    await pastDeadline();
    expect(send).toHaveBeenCalledOnce();

    await act(async () => {
      expect(cancelForSignOut()).toBe(false);
    });
    expect(latest.heldDraft).toEqual(held);
    if (sessionEnds) {
      await act(async () => {
        window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
      });
      expect(latest.heldDraft).toBeNull();
    }
    await act(async () => rejectSave());

    expect(latest.heldDraft).toBeNull();
    expect(latest.recoverableDraft).toEqual(sessionEnds ? null : held);
    expect(
      toast
        .getToasts()
        .some(
          (event) =>
            'title' in event &&
            event.title === '無法確認區域是否已儲存，請先查看區域清單。',
        ),
    ).toBe(!sessionEnds);
  });

  it('keeps a draft the map could not take back across an unmount, and resets it with the identity', async () => {
    const held = draft();

    const send = vi.fn().mockResolvedValue('new-area');
    await act(async () => {
      latest.holdDraft(held, { message: '已建立區域', send });
    });
    await unmountMapView();
    await onScreen();
    await pressUndo();
    await mountMap();
    expect(latest.recoverableDraft).toEqual(held);
    expect(send).not.toHaveBeenCalled();
    expect(view.restoreDraft).not.toHaveBeenCalled();

    await nextIdentity();
    expect(latest.recoverableDraft).toBeNull();
    expect(latest.heldDraft).toBeNull();
  });

  it('cancels a held draft when the identity goes, so it is not written as the next one', async () => {
    const send = vi.fn().mockResolvedValue('new-area');

    await act(async () => {
      latest.holdDraft(draft(), {
        message: '已建立危險區「堤防潰口」',
        send,
      });
    });

    await nextIdentity();
    await pastDeadline();

    expect(send).not.toHaveBeenCalled();
    expect(latest.heldDraft).toBeNull();
  });
});
