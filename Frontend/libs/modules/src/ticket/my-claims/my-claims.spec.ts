import { describe, expect, it } from 'vitest';

import {
  formatClaimedAt,
  formatTaiwanTime,
  myClaimTicketHref,
  openClaimedTicket,
  readMyClaims,
  type MyTaskAssignmentRow,
} from './my-claims';

function row(
  overrides: Partial<MyTaskAssignmentRow['ticket']> = {},
): MyTaskAssignmentRow {
  return {
    assignment: { uuid: 'assignment-1', assignedAt: '2026-09-30T06:05:00Z' },
    task: { uuid: 'need-1', taskName: '清淤', recruitingStoppedAt: null },
    ticket: {
      uuid: 'ticket-1',
      title: '光復鄉佛祖街需要清淤',
      contactName: '王小姐',
      contactPhone: '0912-345-678',
      secondaryLocation: {
        county: '花蓮縣',
        city: '光復鄉',
        lane: '佛祖街',
        no: '89號',
        floor: '1F',
      },
      ...overrides,
    },
  };
}

describe('readMyClaims', () => {
  it('reads what a volunteer needs on the day: where, whom to call, and which need', () => {
    expect(readMyClaims([row()])).toEqual([
      {
        assignmentUuid: 'assignment-1',
        ticketUuid: 'ticket-1',
        ticketTitle: '光復鄉佛祖街需要清淤',
        needName: '清淤',
        claimedAt: '承接於 9/30 14:05',
        address: '花蓮縣光復鄉佛祖街89號 1F',
        contact: '王小姐 · 0912-345-678',
        recruitingStopped: false,
      },
    ]);
  });

  it('knows a need its requester stopped by hand, whose list is final', () => {
    const stopped = {
      ...row(),
      task: {
        uuid: 'need-1',
        taskName: '清淤',
        recruitingStoppedAt: '2026-09-30T09:00:00Z',
      },
    };

    expect(readMyClaims([stopped])[0].recruitingStopped).toBe(true);
  });

  it('keeps the order it came in, newest first as the server sends it', () => {
    const rows = [
      {
        ...row(),
        assignment: { uuid: 'newer', assignedAt: '2026-09-30T08:00:00Z' },
      },
      {
        ...row(),
        assignment: { uuid: 'older', assignedAt: '2026-09-29T08:00:00Z' },
      },
    ];

    expect(readMyClaims(rows).map((claim) => claim.assignmentUuid)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('leaves out an address or a contact the ticket does not have, rather than a blank line', () => {
    const [claim] = readMyClaims([
      row({ secondaryLocation: null, contactName: '  ', contactPhone: null }),
    ]);

    expect(claim.address).toBeNull();
    expect(claim.contact).toBeNull();
  });

  it('gives whichever of the name and the number there is', () => {
    expect(readMyClaims([row({ contactPhone: null })])[0].contact).toBe(
      '王小姐',
    );
    expect(readMyClaims([row({ contactName: null })])[0].contact).toBe(
      '0912-345-678',
    );
  });
});

describe('formatClaimedAt', () => {
  it('says when, in Taiwan time, without the year', () => {
    expect(formatClaimedAt('2026-09-30T06:05:00Z')).toBe('承接於 9/30 14:05');
  });

  it('turns the date over at Taiwan midnight, not UTC’s', () => {
    expect(formatClaimedAt('2026-09-30T16:30:00Z')).toBe('承接於 10/1 00:30');
  });

  it('says nothing for a claim with no time on it', () => {
    expect(formatClaimedAt(null)).toBeNull();
    expect(formatClaimedAt('not a time')).toBeNull();
  });
});

describe('formatTaiwanTime', () => {
  it('reads a moment as month, day and minute in Taiwan time, without the year', () => {
    expect(formatTaiwanTime('2026-09-30T06:05:00Z')).toBe('9/30 14:05');
  });

  it('turns the date over at Taiwan midnight, whatever zone the device is in', () => {
    expect(formatTaiwanTime('2026-09-30T16:30:00Z')).toBe('10/1 00:30');
  });

  it('reads nothing into a missing or broken time', () => {
    expect(formatTaiwanTime(undefined)).toBeNull();
    expect(formatTaiwanTime('not a time')).toBeNull();
  });
});

describe('myClaimTicketHref', () => {
  it('opens the ticket on the list, where the drawer shows it even past the loaded pages', () => {
    expect(myClaimTicketHref('ticket-1')).toBe('/list/ticket?id=ticket-1');
  });
});

describe('openClaimedTicket', () => {
  it('selects the ticket in place on the ticket list, keeping what the list was showing', () => {
    // A link there would change only `?id=`, which the site's route state does not reread.
    const onTicketList = {
      module: 'list',
      state: { dataType: 'ticket', subDataTypes: ['hr'], search: '清淤' },
    } as const;

    expect(openClaimedTicket(onTicketList, 'ticket-1')).toEqual({
      select: {
        dataType: 'ticket',
        subDataTypes: ['hr'],
        search: '清淤',
        selectedMarkerId: 'ticket-1',
      },
    });
  });

  it('goes to the ticket list from anywhere else — the map, the station list, another page', () => {
    const elsewhere = [
      { module: 'map', state: { dataType: 'ticket' } },
      { module: 'list', state: { dataType: 'station' } },
      // `/list` alone is the station list.
      { module: 'list', state: {} },
    ] as const;

    for (const current of elsewhere) {
      expect(openClaimedTicket(current, 'ticket-1')).toEqual({
        href: '/list/ticket?id=ticket-1',
      });
    }
  });
});
