// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { holdRequest, UNDO_MS } from './hold-request';

let container: HTMLDivElement;
let root: Root;

/** Lets the clock move, and the timers it holds with it. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Holds a request the way the map does, and lets its toast reach the screen. */
async function hold(options: Parameters<typeof holdRequest>[0]) {
  const cancel = holdRequest(options);
  // Sonner adds a toast on a zero-delay timer.
  await wait(0);

  return cancel;
}

/** Presses 復原, the toast's one button. */
async function pressUndo() {
  const button = container.querySelector<HTMLButtonElement>(
    'button[data-action]',
  );

  if (!button) {
    throw new Error('no 復原 button on screen');
  }

  await act(async () => button.click());
}

/** Takes the toast off the screen, the way a dismissal does. */
async function dismiss() {
  const [held] = toast.getToasts();

  if (!held) {
    throw new Error('no toast on screen');
  }

  await act(async () => {
    toast.dismiss(held.id);
  });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Toaster));
  });
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

describe('holdRequest', () => {
  it('sends nothing until the toast closes, then sends once', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await hold({ message: 'x', send, onUndo: vi.fn() });
    expect(send).not.toHaveBeenCalled();

    await wait(UNDO_MS);
    expect(send).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('pagehide'));
    await wait(UNDO_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('has no × that could pass for taking the change back', async () => {
    await hold({ message: 'x', send: vi.fn(), onUndo: vi.fn() });

    expect(toast.getToasts()).toHaveLength(1);
    expect(container.querySelector('[data-close-button]')).toBeNull();
  });

  it('lets the rest of the 5 seconds pass when the toast is dismissed early', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await hold({ message: 'x', send, onUndo: vi.fn() });
    await wait(2000);
    await dismiss();
    await wait(2999);
    expect(send).not.toHaveBeenCalled();

    await wait(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('復原 sends nothing, and a dismiss after it sends nothing either', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();

    await hold({ message: 'x', send, onUndo });
    await pressUndo();
    window.dispatchEvent(new Event('pagehide'));
    await wait(UNDO_MS);

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends what is still waiting when the page is left, with keepalive so the navigation cannot cut it off', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    await hold({ message: 'a', send: first, onUndo: vi.fn() });
    await hold({ message: 'b', send: second, onUndo: vi.fn() });
    window.dispatchEvent(new Event('pagehide'));

    expect(first).toHaveBeenCalledWith(true);
    expect(second).toHaveBeenCalledWith(true);
  });

  it('drops a held write on request, without sending it or taking it back', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();

    const cancel = await hold({ message: 'x', send, onUndo });
    await act(async () => cancel());
    await wait(UNDO_MS);

    expect(send).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('sends when 復原 is pressed after the deadline instead of taking the write back', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();

    await hold({ message: 'x', send, onUndo });
    // The clock moves past the deadline but the timer has not run yet.
    await act(async () => vi.setSystemTime(Date.now() + UNDO_MS));
    await pressUndo();

    expect(onUndo).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends on a dismissal after the deadline at once, instead of waiting on a second timer', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await hold({ message: 'x', send, onUndo: vi.fn() });
    await act(async () => vi.setSystemTime(Date.now() + UNDO_MS));
    await dismiss();
    // The dismissal reaches its handler a frame or two on, not at the deadline.
    await wait(50);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks before the page is left only while a request waits', async () => {
    const ask = () => {
      const event = new Event('beforeunload', { cancelable: true });

      window.dispatchEvent(event);

      return event.defaultPrevented;
    };

    await hold({
      message: 'x',
      send: vi.fn().mockResolvedValue(undefined),
      onUndo: vi.fn(),
    });
    expect(ask()).toBe(true);

    await wait(UNDO_MS);
    expect(ask()).toBe(false);
  });
});
