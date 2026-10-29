import { toast } from 'sonner';

// How long a change to an area can still be taken back, which is how long its request is held: the
// backend has no way to restore what was created, deleted or changed (FE-021).
export const UNDO_MS = 5000;

/**
 * Sends nothing for 5 seconds, showing a toast with 復原. Pressing it cancels the request and calls
 * `onUndo`; otherwise `send` runs once the time is up. Returns a function that sends at once, for
 * when the page is left with a request still waiting.
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
    window.clearTimeout(timer);
    void send();
  };
  const timer = window.setTimeout(run, UNDO_MS);

  toast(message, {
    duration: UNDO_MS,
    action: {
      label: '復原',
      onClick: () => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);
        onUndo();
      },
    },
  });

  return run;
}
