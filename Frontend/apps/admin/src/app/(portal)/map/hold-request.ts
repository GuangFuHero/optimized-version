import { toast } from 'sonner';

// How long a change to an area can still be taken back, which is how long its request is held: the
// backend has no way to restore what was created, deleted or changed (FE-021).
export const UNDO_MS = 5000;

// The requests still waiting. Leaving the page with any of them would lose a change the toast has
// already reported, so the page asks first and sends them as it goes.
const pending = new Set<() => void>();
let listening = false;

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (pending.size > 0) {
    event.preventDefault();
  }
}

function sendPending() {
  [...pending].forEach((send) => send());
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
 * `onUndo`; otherwise `send` runs when the toast closes, so 復原 is there exactly as long as the
 * request is held (sonner pauses the toast under the pointer or in a hidden tab, and the request
 * waits with it). A request still waiting when the page is left is sent then. Returns a function
 * that sends at once.
 */
export function holdRequest({
  message,
  send,
  onUndo,
}: {
  message: string;
  send: () => Promise<void>;
  onUndo: () => void;
}): () => void {
  let settled = false;
  const run = () => {
    if (settled) {
      return;
    }

    settled = true;
    pending.delete(run);
    void send();
  };

  pending.add(run);
  listen();

  toast(message, {
    duration: UNDO_MS,
    onAutoClose: run,
    onDismiss: run,
    action: {
      label: '復原',
      onClick: () => {
        if (settled) {
          return;
        }

        settled = true;
        pending.delete(run);
        onUndo();
      },
    },
  });

  return run;
}
