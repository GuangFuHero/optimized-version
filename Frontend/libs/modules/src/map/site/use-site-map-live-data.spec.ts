import { describe, expect, it, vi } from 'vitest';

import type { RescueMapMarkerItem } from '../types';
import { createSiteMapLiveDataStore } from './use-site-map-live-data';

function ticketMarker(id: string, status: string): RescueMapMarkerItem {
  return {
    id,
    title: id,
    subtitle: '',
    position: [23.67, 121.43],
    label: status === 'pending' ? '待處理' : '處理中',
    variant: 'urgent-ticket',
    detailType: 'ticket',
    ticketMeta: { status, priority: 'high' },
  };
}

function storeWith(markers: RescueMapMarkerItem[]) {
  return createSiteMapLiveDataStore({
    markers,
    closureAreas: [],
    isFetching: false,
    error: null,
    hasFetchedOnce: true,
  });
}

describe('replaceTicketStatus', () => {
  it("puts a ticket's status read again on its pin, and tells the map", () => {
    const store = storeWith([
      ticketMarker('ticket-1', 'pending'),
      ticketMarker('ticket-2', 'pending'),
    ]);
    const listener = vi.fn();
    store.subscribe(listener);

    store.replaceTicketStatus('ticket-1', 'completed');

    expect(store.getSnapshot().markers.map((marker) => marker.label)).toEqual([
      '已完成',
      '待處理',
    ]);
    expect(store.getSnapshot().markers[0]?.ticketMeta?.status).toBe(
      'completed',
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps quiet when the map would not change: another ticket, or the status it shows already', () => {
    const store = storeWith([ticketMarker('ticket-1', 'pending')]);
    const listener = vi.fn();
    store.subscribe(listener);

    store.replaceTicketStatus('ticket-9', 'completed');
    store.replaceTicketStatus('ticket-1', 'pending');

    expect(listener).not.toHaveBeenCalled();
  });
});
