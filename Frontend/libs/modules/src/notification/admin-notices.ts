/**
 * The back office's inbox: what the top bar's bell lists for a coordinator, gov or team account.
 * The site's bell (`site-notices.ts`) keeps what is about the viewer's own needs; this one keeps
 * what asks for the back office's attention, or tells it what changed on its team. Both read the
 * same `GET /notifications`, and each shows only the types it knows.
 */

import { timeAgo } from '../time';
import type { NotificationRow } from './site-notices';

/** The kinds of notice the back office shows, each with its own icon. */
export type AdminNoticeKind =
  | 'suggestion'
  | 'dedup'
  | 'role'
  | 'assign'
  | 'team'
  | 'station';

/** 等你處理: something to do. 你的團隊: something that happened. */
export type AdminNoticeGroup = 'act' | 'team';

export const ADMIN_NOTICE_GROUPS: Record<
  AdminNoticeGroup,
  { title: string; hint: string }
> = {
  act: { title: '等你處理', hint: '點一下直接去處理' },
  team: { title: '你的團隊', hint: '跟你的團隊有關的動態' },
};

/** Where a notice of a type opens: a page, or the station it names. */
type AdminPage = '/stations' | '/audit' | '/users' | '/map' | '/teams';

/**
 * The backend's event types the back office shows, how each reads, and what it opens. A list of
 * what to show rather than of what to hide, so an event added later stays out until someone
 * decides it is for the back office.
 */
const ADMIN_NOTICE_TYPES: Partial<
  Record<
    string,
    {
      kind: AdminNoticeKind;
      group: AdminNoticeGroup;
      page: AdminPage;
      /** The page opens on the station the notice names, when it names one. */
      opensStation?: boolean;
      /** Whether it adds to the bell's number. A station's data changing is news, not a task. */
      countsOnBell?: false;
    }
  >
> = {
  // The ref is the suggestion, not the station, so it opens the list and cannot pick a station.
  station_suggestion_created: {
    kind: 'suggestion',
    group: 'act',
    page: '/stations',
  },
  dedup_review_pending: { kind: 'dedup', group: 'act', page: '/audit' },
  role_request_submitted: { kind: 'role', group: 'act', page: '/users' },
  station_assigned: {
    kind: 'assign',
    group: 'team',
    page: '/stations',
    opensStation: true,
  },
  station_unassigned: {
    kind: 'assign',
    group: 'team',
    page: '/stations',
    opensStation: true,
  },
  // The map has no deep link to a zone yet, so a click opens the page.
  zone_assigned: { kind: 'assign', group: 'team', page: '/map' },
  zone_unassigned: { kind: 'assign', group: 'team', page: '/map' },
  team_member_added: { kind: 'team', group: 'team', page: '/teams' },
  team_suspended: { kind: 'team', group: 'team', page: '/teams' },
  resource_station_updated: {
    kind: 'station',
    group: 'team',
    page: '/stations',
    opensStation: true,
    countsOnBell: false,
  },
};

/**
 * The page a notice opens, or null for a type that is not the back office's. A notice that names
 * a station opens it; one that names anything else, a suggestion included, opens the page.
 */
export function adminNoticeHref({
  type,
  ref_type,
  ref_uuid,
}: Pick<NotificationRow, 'type' | 'ref_type' | 'ref_uuid'>): string | null {
  const entry = ADMIN_NOTICE_TYPES[type];

  if (!entry) {
    return null;
  }

  return entry.opensStation && ref_type === 'station' && ref_uuid
    ? `${entry.page}?station=${ref_uuid}`
    : entry.page;
}

/** A notice as the bell shows it. */
export interface AdminNotice {
  uuid: string;
  kind: AdminNoticeKind;
  group: AdminNoticeGroup;
  summary: string;
  detail: string | null;
  read: boolean;
  createdAt: string | null;
  /** 「25 分鐘前」, or null for a notice with no time on it. */
  ago: string | null;
  href: string;
  countsOnBell: boolean;
}

/** The notices the back office shows, in the order the server sends them. */
export function readAdminNotices(
  rows: readonly NotificationRow[],
  now: Date = new Date(),
): AdminNotice[] {
  return rows.flatMap((row) => {
    const entry = ADMIN_NOTICE_TYPES[row.type];
    const href = adminNoticeHref(row);

    if (!entry || href === null) {
      return [];
    }

    return [
      {
        uuid: row.uuid,
        kind: entry.kind,
        group: entry.group,
        summary: row.title,
        detail: row.body,
        read: row.read,
        createdAt: row.created_at ?? null,
        ago: timeAgo(row.created_at, now),
        href,
        countsOnBell: entry.countsOnBell !== false,
      },
    ];
  });
}

/** The notices under their headings, 等你處理 first, each with its unread count; an empty one is left out. */
export function groupAdminNotices(
  notices: readonly AdminNotice[],
): { group: AdminNoticeGroup; notices: AdminNotice[]; unread: number }[] {
  return (['act', 'team'] as const)
    .map((group) => {
      const inGroup = notices.filter((notice) => notice.group === group);

      return {
        group,
        notices: inGroup,
        unread: inGroup.filter((notice) => !notice.read).length,
      };
    })
    .filter(({ notices: inGroup }) => inGroup.length > 0);
}
