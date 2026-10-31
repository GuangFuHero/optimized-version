import { describe, expect, it, vi } from 'vitest';

import {
  announceTicketChanged,
  announceTicketCreated,
  announceTicketReread,
  onTicketChanged,
  onTicketCreated,
  onTicketReread,
  type CreatedTicket,
} from './ticket-changes';

describe('ticket changes', () => {
  it('tells everyone listening which ticket changed', () => {
    const drawer = vi.fn();
    const list = vi.fn();
    const stopDrawer = onTicketChanged(drawer);
    const stopList = onTicketChanged(list);

    announceTicketChanged('ticket-1');

    expect(drawer).toHaveBeenCalledWith('ticket-1');
    expect(list).toHaveBeenCalledWith('ticket-1');
    stopDrawer();
    stopList();
  });

  it('stops telling a listener that has gone, as a page does when the volunteer leaves it', () => {
    const listener = vi.fn();
    const stop = onTicketChanged(listener);

    stop();
    announceTicketChanged('ticket-1');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ticket reread', () => {
  it('tells every other copy which ticket was read again, until it stops listening', () => {
    const building = vi.fn();
    const stop = onTicketReread(building);

    announceTicketReread('ticket-1');
    stop();
    announceTicketReread('ticket-2');

    expect(building).toHaveBeenCalledTimes(1);
    expect(building).toHaveBeenCalledWith('ticket-1');
  });

  it('is not word that a ticket changed, which would have the page read it once more', () => {
    const changed = vi.fn();
    const stop = onTicketChanged(changed);

    announceTicketReread('ticket-1');

    expect(changed).not.toHaveBeenCalled();
    stop();
  });
});

describe('ticket created', () => {
  // Opaque here: what matters is that every listener gets the very ticket the server answered with.
  const ticket = { tasks: [] } as unknown as CreatedTicket;

  it('hands the new ticket itself to everyone listening, as no view holds it yet', () => {
    const map = vi.fn();
    const list = vi.fn();
    const stopMap = onTicketCreated(map);
    const stopList = onTicketCreated(list);

    announceTicketCreated(ticket);

    expect(map).toHaveBeenCalledWith(ticket);
    expect(list).toHaveBeenCalledWith(ticket);
    stopMap();
    stopList();
  });

  it('stops telling a listener that has gone', () => {
    const listener = vi.fn();
    const stop = onTicketCreated(listener);

    stop();
    announceTicketCreated(ticket);

    expect(listener).not.toHaveBeenCalled();
  });

  it('is not word that a ticket changed: there is nothing yet to reload', () => {
    const changed = vi.fn();
    const stop = onTicketChanged(changed);

    announceTicketCreated(ticket);

    expect(changed).not.toHaveBeenCalled();
    stop();
  });
});
