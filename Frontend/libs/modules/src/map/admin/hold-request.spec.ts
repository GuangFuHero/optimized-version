import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ToastOptions = {
  closeButton: boolean;
  onAutoClose: () => void;
  onDismiss: () => void;
  action: { onClick: () => void };
};

const toast = vi.fn<(message: string, options: ToastOptions) => void>();

vi.mock('sonner', () => ({ toast }));

let windowEvents: EventTarget;

async function load() {
  vi.resetModules();

  return (await import('./hold-request')).holdRequest;
}

function lastToast(): ToastOptions {
  const call = toast.mock.calls.at(-1);

  if (!call) {
    throw new Error('no toast was shown');
  }

  return call[1];
}

describe('holdRequest', () => {
  beforeEach(() => {
    toast.mockReset();
    vi.useFakeTimers();
    windowEvents = Object.assign(new EventTarget(), {
      setTimeout: globalThis.setTimeout,
    });
    vi.stubGlobal('window', windowEvents);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends nothing until the toast closes, then sends once', async () => {
    const holdRequest = await load();
    const send = vi.fn().mockResolvedValue(undefined);

    holdRequest({ message: 'x', send, onUndo: vi.fn() });
    expect(send).not.toHaveBeenCalled();

    lastToast().onAutoClose();
    lastToast().onDismiss();
    windowEvents.dispatchEvent(new Event('pagehide'));
    vi.runAllTimers();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('has no × that could pass for taking the change back', async () => {
    const holdRequest = await load();

    holdRequest({ message: 'x', send: vi.fn(), onUndo: vi.fn() });

    expect(lastToast().closeButton).toBe(false);
  });

  it('lets the rest of the 5 seconds pass when the toast is dismissed early', async () => {
    const holdRequest = await load();
    const send = vi.fn().mockResolvedValue(undefined);

    holdRequest({ message: 'x', send, onUndo: vi.fn() });
    vi.advanceTimersByTime(2000);
    lastToast().onDismiss();
    vi.advanceTimersByTime(2999);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('復原 sends nothing, and a dismiss after it sends nothing either', async () => {
    const holdRequest = await load();
    const send = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();

    holdRequest({ message: 'x', send, onUndo });
    lastToast().action.onClick();
    lastToast().onDismiss();
    windowEvents.dispatchEvent(new Event('pagehide'));
    vi.runAllTimers();

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends what is still waiting when the page is left', async () => {
    const holdRequest = await load();
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    holdRequest({ message: 'a', send: first, onUndo: vi.fn() });
    holdRequest({ message: 'b', send: second, onUndo: vi.fn() });
    windowEvents.dispatchEvent(new Event('pagehide'));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('asks before the page is left only while a request waits', async () => {
    const holdRequest = await load();
    const ask = () => {
      const event = new Event('beforeunload', { cancelable: true });

      windowEvents.dispatchEvent(event);

      return event.defaultPrevented;
    };

    holdRequest({
      message: 'x',
      send: vi.fn().mockResolvedValue(undefined),
      onUndo: vi.fn(),
    });
    expect(ask()).toBe(true);

    lastToast().onAutoClose();
    expect(ask()).toBe(false);
  });
});
