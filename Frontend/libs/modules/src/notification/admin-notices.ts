/**
 * The back office's inbox: what the top bar's bell lists for a coordinator, gov or team account.
 * The site's bell (`site-notices.ts`) keeps what is about the viewer's own needs; this one keeps
 * what asks for the back office's attention, or tells it what changed on its team. Both read the
 * same `GET /notifications`, and each shows only the types it knows.
 */

import { timeAgo } from '../time';
import { adminNoticeText } from './admin-notice-text';
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

/** Where a notice of a type opens: a page, or the station or zone it names. */
type AdminPage = '/stations' | '/audit' | '/users' | '/map' | '/teams';

/** What a page can open from its URL: the ref it takes, and the query parameter it reads. */
const OPENS = {
  station: { refType: 'station', param: 'station' },
  zone: { refType: 'work_zone', param: 'zone' },
} as const;

interface AdminNoticeEntry {
  kind: AdminNoticeKind;
  group: AdminNoticeGroup;
  page: AdminPage;
  /** The page opens on the station or zone the notice names, when it names one. */
  opens?: keyof typeof OPENS;
  /**
   * Where it opens instead when `params.team_name` names a team to join: that team's own admins
   * review it there, and they may not open `page` (成員與權限 needs `user.view`).
   */
  joinTeamPage?: AdminPage;
  /** Whether it adds to the bell's number. A station's data changing is news, not a task. */
  countsOnBell?: false;
}

/**
 * The backend's event types the back office shows, how each reads, and what it opens. A list of
 * what to show rather than of what to hide, so an event added later stays out until someone
 * decides it is for the back office.
 */
const ADMIN_NOTICE_TYPES: Partial<Record<string, AdminNoticeEntry>> = {
  // Opens the station to review it. A notice sent before the backend reffed the station (it reffed
  // the suggestion, which no route reads) opens the list.
  station_suggestion_created: {
    kind: 'suggestion',
    group: 'act',
    page: '/stations',
    opens: 'station',
  },
  dedup_review_pending: { kind: 'dedup', group: 'act', page: '/audit' },
  // A platform role, or a new team, is the super admin's to decide (成員與權限); joining a team is
  // that team's admins' (團隊), who get the notice too (ADMIN-027).
  role_request_submitted: {
    kind: 'role',
    group: 'act',
    page: '/users',
    joinTeamPage: '/teams',
  },
  station_assigned: {
    kind: 'assign',
    group: 'team',
    page: '/stations',
    opens: 'station',
  },
  station_unassigned: {
    kind: 'assign',
    group: 'team',
    page: '/stations',
    opens: 'station',
  },
  zone_assigned: { kind: 'assign', group: 'team', page: '/map', opens: 'zone' },
  zone_unassigned: {
    kind: 'assign',
    group: 'team',
    page: '/map',
    opens: 'zone',
  },
  team_member_added: { kind: 'team', group: 'team', page: '/teams' },
  team_suspended: { kind: 'team', group: 'team', page: '/teams' },
  resource_station_updated: {
    kind: 'station',
    group: 'team',
    page: '/stations',
    opens: 'station',
    countsOnBell: false,
  },
};

/**
 * The page a notice opens, or null for a type that is not the back office's. A notice that names
 * a station or zone opens it; one that names anything else, a suggestion included, opens the page.
 */
export function adminNoticeHref(
  row: Pick<NotificationRow, 'type' | 'ref_type' | 'ref_uuid' | 'params'>,
): string | null {
  const entry = ADMIN_NOTICE_TYPES[row.type];

  return entry ? hrefOf(entry, row) : null;
}

function hrefOf(
  { page: listPage, opens, joinTeamPage }: AdminNoticeEntry,
  {
    ref_type,
    ref_uuid,
    params,
  }: Pick<NotificationRow, 'ref_type' | 'ref_uuid' | 'params'>,
): string {
  const teamName = params?.['team_name'];
  const page =
    joinTeamPage && typeof teamName === 'string' && teamName !== ''
      ? joinTeamPage
      : listPage;
  const target = opens ? OPENS[opens] : null;

  return target && ref_type === target.refType && ref_uuid
    ? `${page}?${target.param}=${encodeURIComponent(ref_uuid)}`
    : page;
}

/**
 * Where a notice's link goes from the page the viewer is on. Already on the page it links to, its
 * query is laid over the one there, so a station opens on 資源站點管理 without resetting the
 * filters or the view, as the prototype opens it in place. A link without a query opens as it is.
 */
export function noticeHrefFrom(
  href: string,
  pathname: string,
  search: string,
): string {
  const [path, query] = href.split('?', 2);

  if (path !== pathname || !query) {
    return href;
  }

  const merged = new URLSearchParams(search);

  for (const [key, value] of new URLSearchParams(query)) {
    merged.set(key, value);
  }

  return `${path}?${merged.toString()}`;
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

    if (!entry) {
      return [];
    }

    const text = adminNoticeText(row);

    return [
      {
        uuid: row.uuid,
        kind: entry.kind,
        group: entry.group,
        summary: text.summary,
        detail: text.detail,
        read: row.read,
        createdAt: row.created_at ?? null,
        ago: timeAgo(row.created_at, now),
        href: hrefOf(entry, row),
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
