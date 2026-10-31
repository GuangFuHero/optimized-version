import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ToastOptions = {
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
    windowEvents = new EventTarget();
    vi.stubGlobal('window', windowEvents);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends nothing until the toast closes, then sends once', async () => {
    const holdRequest = await load();
    const send = vi.fn().mockResolvedValue(undefined);

    holdRequest({ message: 'x', send, onUndo: vi.fn() });
    expect(send).not.toHaveBeenCalled();

    lastToast().onAutoClose();
    lastToast().onDismiss();
    windowEvents.dispatchEvent(new Event('pagehide'));

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
