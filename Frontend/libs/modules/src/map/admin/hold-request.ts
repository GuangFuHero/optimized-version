import { toast } from 'sonner';

// Wait before writing so Undo can cancel the request without a restore API.
export const UNDO_MS = 5000;

const pending = new Set<(keepalive?: boolean) => void>();
let listening = false;

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (pending.size > 0) {
    event.preventDefault();
  }
}

function sendPending() {
  [...pending].forEach((send) => send(true));
}

function listen() {
  if (listening) {
    return;
  }

  listening = true;
  window.addEventListener('beforeunload', warnBeforeLeaving);
  window.addEventListener('pagehide', sendPending);
}

/**
 * Sends nothing while the toast with 復原 is on screen. Pressing it cancels the request and calls
 * `onUndo` before the deadline. Leaving the page sends any waiting request. The returned cancel
 * function drops the request without undoing it when its signed-in identity is replaced.
 */
export function holdRequest({
  message,
  send,
  onUndo,
}: {
  message: string;
  send: (keepalive: boolean) => Promise<void>;
  onUndo: () => void;
}): () => void {
  const deadline = Date.now() + UNDO_MS;
  let settled = false;
  const settle = () => {
    if (settled) return false;
    settled = true;
    clearTimeout(timer);
    pending.delete(run);
    toast.dismiss(toastId);
    return true;
  };
  const run = (keepalive = false) => {
    if (settle()) void send(keepalive);
  };
  const timer = window.setTimeout(run, UNDO_MS);

  pending.add(run);
  listen();

  const toastId = toast(message, {
    duration: UNDO_MS,
    closeButton: false,
    onAutoClose: () => run(),
    onDismiss: () => {
      if (Date.now() >= deadline) run();
    },
    action: {
      label: '復原',
      onClick: () => {
        if (Date.now() >= deadline) run();
        else if (settle()) onUndo();
      },
    },
  });

  return () => void settle();
}
