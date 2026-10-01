/**
 * Word that a ticket changed on the server — a need claimed or given back, added or deleted — so
 * that every view of it reloads. Whoever changes it may sit far from those views: 我的任務 lives in
 * the account menu, outside the page whose list and drawer show the ticket. One channel for the
 * whole app, with no React tree to share.
 */

import type { CreateHelpRequestMutation } from '@rescue-frontend/data-access';

const channel = new EventTarget();
const TICKET_CHANGED = 'ticket-changed';
const TICKET_CREATED = 'ticket-created';

/** A ticket just filed, as `createHelpRequest` answers: its fields and its needs. */
export type CreatedTicket = CreateHelpRequestMutation['createHelpRequest'];

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

/**
 * Word that a ticket was just filed (請求協助, in the site shell). No view holds it yet, so there
 * is nothing to reload: the ticket itself goes with the word, for the map and the list to add.
 */
export function announceTicketCreated(ticket: CreatedTicket): void {
  channel.dispatchEvent(new CustomEvent(TICKET_CREATED, { detail: ticket }));
}

/** Listen for it; returns what stops listening, for an effect's cleanup. */
export function onTicketCreated(
  listener: (ticket: CreatedTicket) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<CreatedTicket>).detail);

  channel.addEventListener(TICKET_CREATED, handle);

  return () => channel.removeEventListener(TICKET_CREATED, handle);
}
