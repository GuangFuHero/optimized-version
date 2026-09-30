/**
 * Word that a ticket changed on the server — a need claimed or given back, added or deleted — so
 * that every view of it reloads. Whoever changes it may sit far from those views: 我的任務 lives in
 * the account menu, outside the page whose list and drawer show the ticket. One channel for the
 * whole app, with no React tree to share.
 */

const channel = new EventTarget();
const TICKET_CHANGED = 'ticket-changed';

export function announceTicketChanged(ticketUuid: string): void {
  channel.dispatchEvent(
    new CustomEvent(TICKET_CHANGED, { detail: ticketUuid }),
  );
}

/** Listen for it; returns what stops listening, for an effect's cleanup. */
export function onTicketChanged(
  listener: (ticketUuid: string) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<string>).detail);

  channel.addEventListener(TICKET_CHANGED, handle);

  return () => channel.removeEventListener(TICKET_CHANGED, handle);
}
