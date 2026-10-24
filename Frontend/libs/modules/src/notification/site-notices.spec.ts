import { describe, expect, it } from 'vitest';

import {
  bellLabel,
  countUnreadSiteNotices,
  notMarkedRead,
  readSiteNotices,
  ticketOfNeed,
  withReadState,
  type NotificationRow,
} from './site-notices';

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    uuid: 'notice-1',
    recipient_uuid: 'viewer',
    actor_uuid: 'volunteer',
    type: 'task_claimed',
    priority: 'high',
    ref_type: 'ticket_task',
    ref_uuid: 'need-1',
    title: '林佩珊 承接了你的「分送志工」',
    body: '大進村獨居長者物資配送　目前 2/6 人',
    read: false,
    read_at: null,
    created_at: '2026-10-21T06:05:00Z',
    ...overrides,
  };
}

describe('readSiteNotices', () => {
  it('keeps what is about the viewer and leaves out a site-wide announcement', () => {
    const announcement = row({
      uuid: 'notice-2',
      type: 'announcement_published',
      ref_type: 'announcement',
      title: '📢 全站重要公告',
    });

    expect(
      readSiteNotices([row(), announcement]).map((notice) => notice.uuid),
    ).toEqual(['notice-1']);
  });

  it('reads each of the site’s events as its kind of notice', () => {
    const events = {
      task_claimed: 'claimed',
      task_assignment_created: 'assigned',
      task_full: 'need-full',
      task_recruiting_stopped: 'need-full',
      task_assignment_removed: 'called-off',
      task_deleted: 'called-off',
      ticket_deleted: 'called-off',
      role_request_approved: 'role-approved',
      role_request_rejected: 'role-rejected',
    };
    const rows = Object.keys(events).map((type) => row({ uuid: type, type }));

    expect(
      Object.fromEntries(
        readSiteNotices(rows).map((notice) => [notice.uuid, notice.kind]),
      ),
    ).toEqual(events);
  });

  it('leaves the back office’s notices for its own bell, for a viewer who works there too', () => {
    const backOffice = [
      'zone_assigned',
      'zone_unassigned',
      'team_member_added',
      'resource_station_updated',
      'station_assigned',
      'station_suggestion_created',
      'dedup_flag_ticket',
      'ticket_audit_issue',
      'role_request_submitted',
    ].map((type) => row({ uuid: type, type }));

    expect(readSiteNotices(backOffice)).toEqual([]);
  });

  it('reads what the drawer shows: the words, whether it was read, and when, in Taiwan time', () => {
    expect(readSiteNotices([row()])).toEqual([
      {
        uuid: 'notice-1',
        kind: 'claimed',
        title: '林佩珊 承接了你的「分送志工」',
        body: '大進村獨居長者物資配送　目前 2/6 人',
        read: false,
        at: '10/21 14:05',
        needUuid: 'need-1',
      },
    ]);
  });

  it('points to the need only where its ticket is still the viewer’s to open', () => {
    const open = ['task_claimed', 'task_assignment_created', 'task_full'];
    const shut = [
      // Off the list, or the need or the whole ticket is gone.
      'task_assignment_removed',
      'task_deleted',
      // About the ticket itself, and it is gone.
      'ticket_deleted',
    ];
    const needOf = (type: string) =>
      readSiteNotices([row({ type })])[0].needUuid;

    expect(open.map(needOf)).toEqual(['need-1', 'need-1', 'need-1']);
    expect(shut.map(needOf)).toEqual([null, null, null]);
    expect(
      needOf('role_request_approved'),
      'an application is not a need',
    ).toBeNull();
  });
});

describe('ticketOfNeed', () => {
  // As 我的任務 reads them: 我建立的 (`myTickets`) and 我承接的 (`myTaskAssignments`).
  const lists = {
    requests: [
      { uuid: 'my-ticket', tasks: [{ uuid: 'filed-need' }, { uuid: 'other' }] },
    ],
    claims: [
      { task: { uuid: 'claimed-need' }, ticket: { uuid: 'their-ticket' } },
    ],
  };

  it('finds the ticket of a need the viewer filed — someone is coming to it', () => {
    expect(ticketOfNeed('filed-need', lists)).toBe('my-ticket');
  });

  it('finds the ticket of a need the viewer is on — it filled, or recruiting stopped', () => {
    expect(ticketOfNeed('claimed-need', lists)).toBe('their-ticket');
  });

  it('finds nothing for a need on neither list, given back or deleted since', () => {
    expect(ticketOfNeed('gone-need', lists)).toBeNull();
  });
});

describe('countUnreadSiteNotices', () => {
  it('counts only the unread notices the drawer shows, not an announcement or the back office’s', () => {
    const rows = [
      row({ uuid: 'unread' }),
      row({ uuid: 'read', read: true }),
      row({ uuid: 'announcement', type: 'announcement_published' }),
      row({ uuid: 'back-office', type: 'zone_assigned' }),
    ];

    expect(countUnreadSiteNotices(rows)).toBe(1);
  });
});

describe('withReadState', () => {
  const rows = [row({ uuid: 'a' }), row({ uuid: 'b' }), row({ uuid: 'c' })];

  it('marks only the notices named read, leaving the rest as they were', () => {
    expect(
      withReadState(rows, ['a', 'c'], true).map(({ uuid, read }) => [
        uuid,
        read,
      ]),
    ).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
  });

  it('puts a notice back to unread', () => {
    const read = withReadState(rows, ['a', 'b'], true);

    expect(
      withReadState(read, ['b'], false).map(({ read: isRead }) => isRead),
    ).toEqual([true, false, false]);
  });
});

describe('notMarkedRead', () => {
  it('names the notices whose PATCH failed, so they go back to unread', () => {
    expect(
      notMarkedRead(
        ['a', 'b', 'c'],
        [
          { status: 'fulfilled', value: undefined },
          { status: 'rejected', reason: new Error('offline') },
          { status: 'fulfilled', value: undefined },
        ],
      ),
    ).toEqual(['b']);
  });

  it('names none when every PATCH went through', () => {
    expect(
      notMarkedRead(['a'], [{ status: 'fulfilled', value: undefined }]),
    ).toEqual([]);
  });
});

describe('bellLabel', () => {
  it('says how many are unread, for a screen reader that cannot see the badge', () => {
    expect(bellLabel(0)).toBe('通知');
    expect(bellLabel(12)).toBe('通知，12 則未讀');
  });
});
