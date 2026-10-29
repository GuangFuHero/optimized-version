import { describe, expect, it } from 'vitest';

import type { AdminTicketFieldsFragment } from '@rescue-frontend/data-access/admin';

import type { TicketRow } from './ticket-row';
import {
  resolveMapSelection,
  TICKET_PRIORITY_PIN_COLORS,
  ticketPriorityLegend,
  toCreatedTicketMarker,
  toTicketMarker,
  withMarkerSelected,
} from './ticket-marker';

const row = (over: Partial<TicketRow> = {}): TicketRow =>
  ({
    uuid: 't1',
    title: '淹水',
    status: 'pending',
    priority: 'high',
    area: '花蓮縣 光復鄉',
    position: [23.6, 121.4],
    locationCell: null,
    isCoarse: false,
    address: null,
    ...over,
  }) as TicketRow;

describe('toTicketMarker', () => {
  it('colours the pin by priority', () => {
    expect(toTicketMarker(row({ priority: 'critical' }))?.pin?.color).toBe(
      TICKET_PRIORITY_PIN_COLORS.critical,
    );
    expect(toTicketMarker(row({ priority: 'low' }))?.pin?.color).toBe(
      TICKET_PRIORITY_PIN_COLORS.low,
    );
  });

  it('dims completed and cancelled tickets', () => {
    expect(toTicketMarker(row({ status: 'completed' }))?.pin?.dimmed).toBe(
      true,
    );
    expect(toTicketMarker(row({ status: 'cancelled' }))?.pin?.dimmed).toBe(
      true,
    );
    expect(toTicketMarker(row({ status: 'in_progress' }))?.pin?.dimmed).toBe(
      false,
    );
  });

  it('is a ticket marker', () => {
    const marker = toTicketMarker(row());
    expect(marker).toMatchObject({
      id: 't1',
      detailType: 'ticket',
      position: [23.6, 121.4],
      tooltip: { title: '淹水' },
    });
    expect(marker?.pin?.selected).toBe(false);
  });

  it('passes the coarse cell through', () => {
    const marker = toTicketMarker(
      row({ isCoarse: true, locationCell: '8a2a1072b59ffff' }),
    );
    expect(marker?.locationCell).toBe('8a2a1072b59ffff');
    expect(marker?.position).toEqual([23.6, 121.4]);
  });

  it('skips a ticket without a point', () => {
    expect(toTicketMarker(row({ position: null }))).toBeNull();
  });

  it('draws three colours, as the design prototype: medium and low share the blue', () => {
    expect(TICKET_PRIORITY_PIN_COLORS).toEqual({
      critical: '#D32F2F',
      high: '#F57C00',
      medium: '#2592B9',
      low: '#2592B9',
    });
  });

  it('lists one legend entry per colour, named by its most urgent priority', () => {
    expect(ticketPriorityLegend((p) => p)).toEqual([
      { color: '#D32F2F', label: 'critical' },
      { color: '#F57C00', label: 'high' },
      { color: '#2592B9', label: 'medium' },
    ]);
  });
});

describe('resolveMapSelection', () => {
  const rows = [
    row({ uuid: 'a', locationCell: '8a2a1072b59ffff', isCoarse: true }),
    row({ uuid: 'b', locationCell: '8a2a1072b59ffff', isCoarse: true }),
    row({ uuid: 'c', locationCell: '8a2a1072b5bffff', isCoarse: true }),
    row({ uuid: 'd' }),
  ];

  it('resolves an exact uuid', () => {
    expect(resolveMapSelection('d', rows)).toEqual({
      kind: 'ticket',
      uuid: 'd',
    });
  });

  it('resolves a single-ticket cell to that ticket', () => {
    expect(resolveMapSelection('cell:8a2a1072b5bffff', rows)).toEqual({
      kind: 'ticket',
      uuid: 'c',
    });
  });

  it('lists every ticket of a multi-ticket cell', () => {
    expect(resolveMapSelection('cell:8a2a1072b59ffff', rows)).toEqual({
      kind: 'cell',
      uuids: ['a', 'b'],
    });
  });

  it('gives null for an unknown id or an empty cell', () => {
    expect(resolveMapSelection('nope', rows)).toBeNull();
    expect(resolveMapSelection('cell:8a2a1072b5affff', rows)).toBeNull();
  });
});

describe('toCreatedTicketMarker', () => {
  const created = (over: Partial<AdminTicketFieldsFragment> = {}) =>
    ({
      uuid: 'new-1',
      title: '屋頂受困',
      description: '二樓有兩人',
      geometry: { type: 'Point', coordinates: [121.42, 23.65] },
      status: 'pending',
      priority: 'critical',
      ...over,
    }) as AdminTicketFieldsFragment;

  it('places the marker at the ticket point, as [lat, lng]', () => {
    const marker = toCreatedTicketMarker(created());
    expect(marker).toMatchObject({
      id: 'new-1',
      title: '屋頂受困',
      subtitle: '二樓有兩人',
      position: [23.65, 121.42],
      label: '待處理',
      variant: 'urgent-ticket',
      detailType: 'ticket',
    });
    expect(marker?.ticketMeta?.priority).toBe('critical');
  });

  it('draws a medium or low ticket as in progress, and names an untitled one', () => {
    const marker = toCreatedTicketMarker(
      created({ priority: 'low', title: ' ', description: null }),
    );
    expect(marker?.variant).toBe('in-progress');
    expect(marker?.title).toBe('（未命名任務單）');
    expect(marker?.subtitle).toBe('救災任務');
  });

  it('gives no marker to a ticket without a point', () => {
    expect(toCreatedTicketMarker(created({ geometry: null }))).toBeNull();
  });
});

/** A marker for a ticket that has a point: `toTicketMarker` gives null only without one. */
function markerOf(ticket: ReturnType<typeof row>) {
  const marker = toTicketMarker(ticket);
  if (!marker) throw new Error('expected a marker');
  return marker;
}

describe('withMarkerSelected', () => {
  it('marks a marker selected without touching the original', () => {
    const marker = markerOf(row());
    const selected = withMarkerSelected(marker, true);
    expect(selected.pin?.selected).toBe(true);
    expect(selected.pin?.color).toBe(marker.pin?.color);
    expect(marker.pin?.selected).toBe(false);
  });

  it('returns the same marker when nothing changes', () => {
    const marker = markerOf(row());
    expect(withMarkerSelected(marker, false)).toBe(marker);
  });
});
