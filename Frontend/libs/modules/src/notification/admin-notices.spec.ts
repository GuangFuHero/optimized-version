import { describe, expect, it } from 'vitest';

import {
  adminNoticeHref,
  groupAdminNotices,
  noticeHrefFrom,
  readAdminNotices,
} from './admin-notices';
import type { NotificationRow } from './site-notices';

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    uuid: 'notice-1',
    recipient_uuid: 'viewer',
    actor_uuid: null,
    type: 'dedup_review_pending',
    priority: 'high',
    ref_type: null,
    ref_uuid: null,
    title: '有重複工單等你審核',
    body: '3 張工單疑似重複',
    read: false,
    read_at: null,
    created_at: '2026-10-21T06:05:00Z',
    ...overrides,
  };
}

describe('readAdminNotices', () => {
  it('readAdminNotices uses the frontend sentence', () => {
    const [notice] = readAdminNotices([
      row({
        type: 'zone_assigned',
        title: '後端標題',
        body: '後端內文',
        params: { zone_name: '大平村', team_name: '慈濟' },
      }),
    ]);

    expect(notice.summary).toBe('「慈濟」被指派負責責任區「大平村」');
    expect(notice.detail).toBe('點這裡看範圍');
  });

  it('drops site-only types', () => {
    const rows = [
      'task_claimed',
      'role_request_approved',
      'announcement_published',
    ].map((type, index) => row({ uuid: `n${index}`, type }));

    expect(readAdminNotices(rows)).toEqual([]);
  });

  it.each([
    ['station_suggestion_created', 'suggestion', 'act', '/stations'],
    ['dedup_review_pending', 'dedup', 'act', '/audit'],
    ['role_request_submitted', 'role', 'act', '/users'],
    ['station_assigned', 'assign', 'team', '/stations'],
    ['station_unassigned', 'assign', 'team', '/stations'],
    ['zone_assigned', 'assign', 'team', '/map'],
    ['zone_unassigned', 'assign', 'team', '/map'],
    ['team_member_added', 'team', 'team', '/teams'],
    ['team_suspended', 'team', 'team', '/teams'],
    ['resource_station_updated', 'station', 'team', '/stations'],
  ])('maps %s to its kind, group and page', (type, kind, group, href) => {
    expect(readAdminNotices([row({ type })])).toMatchObject([
      { kind, group, href },
    ]);
  });

  it('keeps the row’s own words and the server order', () => {
    const notices = readAdminNotices([
      row({ uuid: 'b', title: 'T', body: 'B' }),
      row({ uuid: 'a', type: 'team_suspended', body: '' }),
    ]);

    expect(notices.map((notice) => notice.uuid)).toEqual(['b', 'a']);
    expect(notices[0]).toMatchObject({
      summary: 'T',
      detail: 'B',
      read: false,
    });
  });

  it('counts on the bell except for station updates', () => {
    const [update, zone] = readAdminNotices([
      row({ type: 'resource_station_updated' }),
      row({ type: 'zone_assigned' }),
    ]);

    expect(update.countsOnBell).toBe(false);
    expect(zone.countsOnBell).toBe(true);
  });

  it('dates a notice with timeAgo', () => {
    const [notice] = readAdminNotices(
      [row({ created_at: '2026-10-21T06:05:00Z' })],
      new Date('2026-10-21T06:30:00Z'),
    );

    expect(notice.createdAt).toBe('2026-10-21T06:05:00Z');
    expect(notice.ago).toBe('25 分鐘前');
  });
});

describe('adminNoticeHref', () => {
  it('opens the station', () => {
    expect(
      adminNoticeHref({
        type: 'station_assigned',
        ref_type: 'station',
        ref_uuid: 's1',
      }),
    ).toBe('/stations?station=s1');
  });

  it('sends a request to join a team to 團隊, and any other request to 成員與權限', () => {
    const request = {
      type: 'role_request_submitted',
      ref_type: 'role_request',
      ref_uuid: 'r1',
    };

    expect(
      adminNoticeHref({
        ...request,
        params: { team_name: '慈濟基金會-花蓮聯絡處' },
      }),
    ).toBe('/teams');
    expect(
      adminNoticeHref({
        ...request,
        params: { team_name: null, new_team_name: '新團隊' },
      }),
    ).toBe('/users');
    expect(adminNoticeHref({ ...request, params: { team_name: '' } })).toBe(
      '/users',
    );
    expect(adminNoticeHref({ ...request, params: null })).toBe('/users');
  });

  it('opens the zone on the map', () => {
    expect(
      adminNoticeHref({
        type: 'zone_assigned',
        ref_type: 'work_zone',
        ref_uuid: 'z1',
      }),
    ).toBe('/map?zone=z1');
    expect(
      adminNoticeHref({
        type: 'zone_unassigned',
        ref_type: 'station',
        ref_uuid: 'z1',
      }),
    ).toBe('/map');
  });

  it('opens the station a suggestion is on, for review', () => {
    expect(
      adminNoticeHref({
        type: 'station_suggestion_created',
        ref_type: 'station',
        ref_uuid: 's1',
      }),
    ).toBe('/stations?station=s1');
  });

  it('opens the station list without a station uuid', () => {
    expect(
      adminNoticeHref({
        type: 'station_assigned',
        ref_type: 'station',
        ref_uuid: null,
      }),
    ).toBe('/stations');
    expect(
      adminNoticeHref({
        type: 'station_suggestion_created',
        // Sent before the backend reffed the station.
        ref_type: 'station_suggestion',
        ref_uuid: 's1',
      }),
    ).toBe('/stations');
  });

  it('is null for a type that is not the back office’s', () => {
    expect(
      adminNoticeHref({ type: 'task_claimed', ref_type: null, ref_uuid: null }),
    ).toBeNull();
  });
});

describe('groupAdminNotices', () => {
  const notices = readAdminNotices([
    row({ uuid: 't', type: 'team_member_added' }),
    row({ uuid: 'a1' }),
    row({ uuid: 'a2', read: true }),
  ]);

  it('puts act first and counts unread per group', () => {
    const groups = groupAdminNotices(notices);

    expect(groups.map((g) => [g.group, g.unread])).toEqual([
      ['act', 1],
      ['team', 1],
    ]);
    expect(groups[0].notices.map((n) => n.uuid)).toEqual(['a1', 'a2']);
  });

  it('leaves out an empty group', () => {
    expect(groupAdminNotices(notices.slice(0, 1)).map((g) => g.group)).toEqual([
      'team',
    ]);
  });
});

describe('noticeHrefFrom', () => {
  it('keeps the filters and view when already on the page', () => {
    expect(
      noticeHrefFrom(
        '/stations?station=s-2',
        '/stations',
        '?view=map&type=water&station=s-1',
      ),
    ).toBe('/stations?view=map&type=water&station=s-2');
  });

  it('opens the link as it is from another page', () => {
    expect(noticeHrefFrom('/stations?station=s-2', '/map', '?zone=z-1')).toBe(
      '/stations?station=s-2',
    );
  });

  it('opens a link without a query as it is', () => {
    expect(noticeHrefFrom('/audit', '/audit', '?tab=done')).toBe('/audit');
  });
});
