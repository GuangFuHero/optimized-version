import { latLngToCell } from 'h3-js';
import { describe, expect, it, vi } from 'vitest';

import type { RescueMapMarkerItem } from '../types';
import { toLocationCells } from './ticket-cells';
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
    cells: [],
    cellsNotice: null,
    closureAreas: [],
    publicZones: [],
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

describe('replaceData', () => {
  const zone = {
    id: 'zone-1',
    name: '大平村',
    comment: null,
    polygons: [
      [
        [
          [23.66, 121.42],
          [23.67, 121.42],
          [23.67, 121.43],
        ],
      ],
    ] as [number, number][][][],
    kind: 'team_zone' as const,
    teams: ['慈濟基金會'],
  };

  it('tells the map when a zone changes what it says, and not when it is fetched again as it was', () => {
    const store = createSiteMapLiveDataStore({
      markers: [],
      cells: [],
      cellsNotice: null,
      closureAreas: [],
      publicZones: [zone],
      isFetching: false,
      error: null,
      hasFetchedOnce: true,
    });
    const listener = vi.fn();
    store.subscribe(listener);

    store.replaceData({ ...store.getSnapshot(), publicZones: [{ ...zone }] });
    expect(listener).not.toHaveBeenCalled();

    store.replaceData({
      ...store.getSnapshot(),
      publicZones: [{ ...zone, teams: ['慈濟基金會', '紅十字會'] }],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().publicZones[0]?.teams).toHaveLength(2);
  });
});

describe('replaceData: counted cells', () => {
  const CELL = latLngToCell(23.6654321, 121.4312345, 8);
  const counted = (count: number) =>
    toLocationCells([{ cell: CELL, ticketCount: count, urgentCount: 0 }]);

  it('tells the map when a count changes, and keeps the same cells when they are read again as they were', () => {
    const store = storeWith([]);
    const listener = vi.fn();
    store.subscribe(listener);

    store.replaceData({ ...store.getSnapshot(), cells: counted(245) });
    const drawn = store.getSnapshot().cells;
    store.replaceData({ ...store.getSnapshot(), cells: counted(245) });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().cells).toBe(drawn);

    store.replaceData({ ...store.getSnapshot(), cells: counted(246) });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().cells[0]?.count).toBe(246);
  });

  it('tells the map when the reason the counts could not be read comes and goes', () => {
    const store = storeWith([]);
    const listener = vi.fn();
    store.subscribe(listener);

    store.replaceData({
      ...store.getSnapshot(),
      cellsNotice: '請放大地圖再試',
    });
    store.replaceData({ ...store.getSnapshot(), cellsNotice: null });

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
