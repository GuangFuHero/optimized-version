import { describe, expect, it } from 'vitest';

import type { TicketNeed } from '../ticket/needs/need-claim';
import type { BuildingFloor } from './floors';
import {
  buildingTicketOrder,
  formatTicketRowTime,
  isRescueTicket,
  opensByItself,
  quickClaimNeed,
  removedFloorNote,
  showsTicketKinds,
  sortTickets,
  summarizeTicket,
  summarizeTickets,
  ticketUnitLabel,
  type BuildingTicket,
} from './summary';

const NOW = new Date('2024-07-25T08:00:00Z');

function need(overrides: Partial<TicketNeed> = {}): TicketNeed {
  return {
    uuid: 'need',
    taskName: '清淤志工',
    taskType: 'hr',
    quantity: 3,
    status: 'pending',
    assignedCount: 0,
    myAssignment: null,
    ...overrides,
  };
}

function ticket(
  id: string,
  {
    status = 'pending',
    priority = 'medium',
    taskType = 'hr',
    createdAt = '2024-07-25T06:00:00Z',
    floor = null,
    room = null,
    needs = [need()],
  }: {
    status?: string;
    priority?: string;
    taskType?: string;
    createdAt?: string;
    floor?: string | null;
    room?: string | null;
    needs?: TicketNeed[];
  } = {},
): BuildingTicket {
  return {
    marker: {
      id,
      title: id,
      subtitle: '',
      position: [23.66, 121.42],
      label: '',
      variant: 'urgent-ticket',
      detailType: 'ticket',
      ticketMeta: { status, priority, taskType, createdAt },
    },
    floor,
    room,
    needs,
  };
}

const ids = (tickets: readonly BuildingTicket[]) =>
  tickets.map((item) => item.marker.id);

describe('summarizeTicket', () => {
  it('counts the people still missing on open people and supply needs', () => {
    const summary = summarizeTicket(
      ticket('a', {
        needs: [
          need({ quantity: 5, assignedCount: 2 }),
          need({ taskType: 'supply', quantity: 2, assignedCount: 0 }),
        ],
      }),
    );

    expect(summary).toEqual({ closed: false, lack: 5, needText: '缺 5' });
  });

  it('leaves a rescue need out of the shortfall', () => {
    const summary = summarizeTicket(
      ticket('a', {
        taskType: 'rescue',
        needs: [need({ taskType: 'rescue', quantity: 3 })],
      }),
    );

    expect(summary).toEqual({ closed: false, lack: 0, needText: null });
  });

  it('says how many are unknown rather than that everyone came, when no need said how many', () => {
    const summary = summarizeTicket(
      ticket('a', { needs: [need({ taskType: 'supply', quantity: null })] }),
    );

    expect(summary).toEqual({ closed: false, lack: 0, needText: '未指定人數' });
  });

  it('says everyone came once the needs that said how many have their people', () => {
    const summary = summarizeTicket(
      ticket('a', {
        status: 'in_progress',
        needs: [
          need({ quantity: 2, assignedCount: 2, status: 'fulfilled' }),
          need({ quantity: null }),
        ],
      }),
    );

    expect(summary).toEqual({ closed: false, lack: 0, needText: '人已到齊' });
  });

  it('counts nothing missing on a need stopped short, nor once the ticket is finished', () => {
    expect(
      summarizeTicket(
        ticket('a', {
          needs: [need({ quantity: 4, assignedCount: 1, status: 'fulfilled' })],
        }),
      ).lack,
    ).toBe(0);
    expect(summarizeTicket(ticket('b', { status: 'completed' }))).toEqual({
      closed: true,
      lack: 0,
      needText: null,
    });
  });
});

describe('isRescueTicket', () => {
  it('takes the ticket’s own type or a rescue need on it', () => {
    expect(isRescueTicket(ticket('a', { taskType: 'rescue', needs: [] }))).toBe(
      true,
    );
    expect(
      isRescueTicket(
        ticket('b', { needs: [need(), need({ taskType: 'rescue' })] }),
      ),
    ).toBe(true);
    expect(isRescueTicket(ticket('c'))).toBe(false);
  });
});

describe('summarizeTickets', () => {
  it('adds up the shortfall and counts open rescues and finished tickets', () => {
    const summary = summarizeTickets([
      ticket('a', { needs: [need({ quantity: 3, assignedCount: 1 })] }),
      ticket('b', {
        taskType: 'rescue',
        needs: [need({ taskType: 'rescue', quantity: null })],
      }),
      ticket('c', { taskType: 'rescue', status: 'completed', needs: [] }),
      ticket('d', { status: 'completed' }),
    ]);

    expect(summary).toEqual({
      lack: 2,
      rescueOpen: 1,
      closedCount: 2,
      ticketCount: 4,
    });
  });
});

describe('opensByItself', () => {
  it('opens a floor with someone still to find or people still missing', () => {
    expect(
      opensByItself([ticket('a', { taskType: 'rescue', needs: [] })]),
    ).toBe(true);
    expect(opensByItself([ticket('b')])).toBe(true);
  });

  it('keeps a floor shut with nothing missing, and an empty one', () => {
    expect(
      opensByItself([ticket('a', { needs: [need({ quantity: null })] })]),
    ).toBe(false);
    expect(opensByItself([ticket('b', { status: 'completed' })])).toBe(false);
    expect(opensByItself([])).toBe(false);
  });
});

describe('sortTickets', () => {
  it('lists a search first, then those short of people, then the rest open, then the finished', () => {
    const sorted = sortTickets([
      ticket('finished', { status: 'completed' }),
      ticket('full', { needs: [need({ quantity: null })] }),
      ticket('short', { needs: [need({ quantity: 5 })] }),
      ticket('rescue', {
        taskType: 'rescue',
        needs: [need({ taskType: 'rescue', quantity: null })],
      }),
      ticket('rescue-finished', {
        taskType: 'rescue',
        status: 'completed',
        needs: [],
      }),
    ]);

    expect(ids(sorted)).toEqual([
      'rescue',
      'short',
      'full',
      'finished',
      'rescue-finished',
    ]);
  });

  it('puts the more urgent first among equals, and then the newest', () => {
    const sorted = sortTickets([
      ticket('old', { createdAt: '2024-07-24T01:00:00Z' }),
      ticket('new', { createdAt: '2024-07-25T01:00:00Z' }),
      ticket('high', { priority: 'high', createdAt: '2024-07-24T00:00:00Z' }),
      ticket('critical', {
        priority: 'critical',
        createdAt: '2024-07-23T00:00:00Z',
      }),
    ]);

    expect(ids(sorted)).toEqual(['critical', 'high', 'new', 'old']);
  });
});

describe('buildingTicketOrder', () => {
  const floors: BuildingFloor[] = ['3F', '2F', '1F'].map((label) => ({
    label,
    areas: [],
  }));

  it('runs floor by floor in the drawer’s order, each sorted, then the unplaced', () => {
    const order = buildingTicketOrder(floors, [
      ticket('unplaced', { taskType: 'rescue', needs: [] }),
      ticket('3F-short', { floor: '3F' }),
      ticket('1F-finished', { floor: '1F', status: 'completed' }),
      ticket('3F-rescue', { floor: '3F', taskType: 'rescue', needs: [] }),
      ticket('2F', { floor: '2F' }),
    ]);

    expect(ids(order)).toEqual([
      '1F-finished',
      '2F',
      '3F-rescue',
      '3F-short',
      'unplaced',
    ]);
  });
});

describe('showsTicketKinds', () => {
  it('draws the icons only when the building holds more than one kind', () => {
    expect(showsTicketKinds([ticket('a'), ticket('b')])).toBe(false);
    expect(
      showsTicketKinds([ticket('a'), ticket('b', { taskType: 'supply' })]),
    ).toBe(true);
  });
});

describe('ticketUnitLabel', () => {
  it('gives the room alone, the floor never', () => {
    expect(ticketUnitLabel(ticket('a', { floor: '3F', room: ' 302 ' }))).toBe(
      '302',
    );
    expect(ticketUnitLabel(ticket('b', { floor: '7F', room: '701' }))).toBe(
      '701',
    );
    expect(ticketUnitLabel(ticket('c', { floor: '3F' }))).toBeNull();
    expect(ticketUnitLabel(ticket('d', { room: '  ' }))).toBeNull();
  });
});

describe('removedFloorNote', () => {
  it('names the floor an unplaced ticket was filed on, which the building no longer has', () => {
    expect(
      removedFloorNote(ticket('a', { floor: '7F', room: '701' }), false),
    ).toBe('原本在 7F（這一層已從大樓設定移除）');
    expect(removedFloorNote(ticket('b', { floor: ' B2 ' }), false)).toBe(
      '原本在 B2（這一層已從大樓設定移除）',
    );
  });

  it('has nothing to say for a ticket on its floor, or filed without one', () => {
    expect(removedFloorNote(ticket('a', { floor: '3F' }), true)).toBeNull();
    expect(removedFloorNote(ticket('b'), false)).toBeNull();
    expect(removedFloorNote(ticket('c', { floor: '  ' }), false)).toBeNull();
  });
});

describe('formatTicketRowTime', () => {
  it('says how long ago within a day, and the date in Taiwan after', () => {
    expect(formatTicketRowTime('2024-07-25T07:30:00Z', NOW)).toBe('30 分鐘前');
    expect(formatTicketRowTime('2024-07-24T08:00:01Z', NOW)).toBe('23 小時前');
    // 2024-07-23 20:00 in Taiwan.
    expect(formatTicketRowTime('2024-07-23T12:00:00Z', NOW)).toBe('7/23');
    // 2024-07-23 01:00 in Taiwan, still the 22nd by UTC.
    expect(formatTicketRowTime('2024-07-22T17:00:00Z', NOW)).toBe('7/23');
  });

  it('has nothing to say for a missing or broken time', () => {
    expect(formatTicketRowTime(null, NOW)).toBeNull();
    expect(formatTicketRowTime('not a time', NOW)).toBeNull();
  });
});

describe('quickClaimNeed', () => {
  it('offers the one need of a ticket that has one, while it can be taken', () => {
    const only = need({ uuid: 'only' });

    expect(quickClaimNeed(ticket('a', { needs: [only] }), true)).toBe(only);
  });

  it('offers nothing with two needs, nor on a need that cannot be taken', () => {
    expect(
      quickClaimNeed(ticket('a', { needs: [need(), need()] }), true),
    ).toBeNull();
    expect(
      quickClaimNeed(
        ticket('b', { needs: [need({ assignedCount: 3 })] }),
        true,
      ),
    ).toBeNull();
    expect(
      quickClaimNeed(
        ticket('c', { needs: [need({ myAssignment: { uuid: 'mine' } })] }),
        true,
      ),
    ).toBeNull();
    expect(
      quickClaimNeed(ticket('d', { status: 'completed' }), true),
    ).toBeNull();
    expect(quickClaimNeed(ticket('e'), false)).toBeNull();
  });
});
