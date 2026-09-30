import { describe, expect, it, vi } from 'vitest';

import { announceTicketChanged, onTicketChanged } from './ticket-changes';

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
