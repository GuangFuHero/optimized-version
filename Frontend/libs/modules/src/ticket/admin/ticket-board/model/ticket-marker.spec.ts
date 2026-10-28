import { describe, expect, it } from 'vitest';

import type { TicketRow } from './ticket-row';
import {
  resolveMapSelection,
  TICKET_PRIORITY_PIN_COLORS,
  toTicketMarker,
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
    ...over,
  }) as TicketRow;

describe('toTicketMarker', () => {
  it('colours the pin by priority', () => {
    expect(
      toTicketMarker(row({ priority: 'critical' }), false)?.pin?.color,
    ).toBe(TICKET_PRIORITY_PIN_COLORS.critical);
    expect(toTicketMarker(row({ priority: 'low' }), false)?.pin?.color).toBe(
      TICKET_PRIORITY_PIN_COLORS.low,
    );
  });

  it('dims completed and cancelled tickets', () => {
    expect(
      toTicketMarker(row({ status: 'completed' }), false)?.pin?.dimmed,
    ).toBe(true);
    expect(
      toTicketMarker(row({ status: 'cancelled' }), false)?.pin?.dimmed,
    ).toBe(true);
    expect(
      toTicketMarker(row({ status: 'in_progress' }), false)?.pin?.dimmed,
    ).toBe(false);
  });

  it('is a ticket marker', () => {
    const marker = toTicketMarker(row(), true);
    expect(marker).toMatchObject({
      id: 't1',
      detailType: 'ticket',
      position: [23.6, 121.4],
      tooltip: { title: '淹水' },
    });
    expect(marker?.pin?.selected).toBe(true);
  });

  it('passes the coarse cell through', () => {
    const marker = toTicketMarker(
      row({ isCoarse: true, locationCell: '8a2a1072b59ffff' }),
      false,
    );
    expect(marker?.locationCell).toBe('8a2a1072b59ffff');
    expect(marker?.position).toEqual([23.6, 121.4]);
  });

  it('skips a ticket without a point', () => {
    expect(toTicketMarker(row({ position: null }), false)).toBeNull();
  });

  it('has four distinct priority colours', () => {
    expect(new Set(Object.values(TICKET_PRIORITY_PIN_COLORS)).size).toBe(4);
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
