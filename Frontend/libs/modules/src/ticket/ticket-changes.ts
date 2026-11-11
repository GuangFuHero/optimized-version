import { createStore } from 'zustand';

import type { CreateHelpRequestMutation } from '@rescue-frontend/data-access';

type TicketFiled = Extract<
  CreateHelpRequestMutation['createHelpRequest'],
  { __typename: 'TicketCreated' }
>;

/** A ticket just filed, as `createHelpRequest` answers when it files one: its fields and its needs. */
export type CreatedTicket = TicketFiled['ticket'] & {
  tasks: TicketFiled['tasks'];
};

type TicketEvent =
  | { kind: 'changed'; uuid: string }
  | { kind: 'reread'; uuid: string }
  | { kind: 'created'; ticket: CreatedTicket };

const events = createStore<TicketEvent | null>(() => null);

/** Signals a server change so mounted ticket views can refresh their queries. */
export function announceTicketChanged(uuid: string): void {
  events.setState({ kind: 'changed', uuid }, true);
}

export function onTicketChanged(listener: (uuid: string) => void): () => void {
  return events.subscribe((event) => {
    if (event?.kind === 'changed') listener(event.uuid);
  });
}

/** Signals a completed refresh to dependent building views. */
export function announceTicketReread(uuid: string): void {
  events.setState({ kind: 'reread', uuid }, true);
}

export function onTicketReread(listener: (uuid: string) => void): () => void {
  return events.subscribe((event) => {
    if (event?.kind === 'reread') listener(event.uuid);
  });
}

/** Gives mounted maps and lists the newly created ticket until their next query refresh. */
export function announceTicketCreated(ticket: CreatedTicket): void {
  events.setState({ kind: 'created', ticket }, true);
}

export function onTicketCreated(
  listener: (ticket: CreatedTicket) => void,
): () => void {
  return events.subscribe((event) => {
    if (event?.kind === 'created') listener(event.ticket);
  });
}
