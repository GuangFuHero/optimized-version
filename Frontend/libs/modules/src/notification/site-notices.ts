/**
 * The site's inbox (prototype `site-notify.jsx`): only what is about the viewer — someone coming to
 * a need they filed, a change to a need they said they would go to, and the answer to their own
 * application. A site-wide announcement is sent to every account too, but it has the banner, and
 * the back office's notices wait for its own bell (C-2: an inbox mixed with broadcasts dulls both).
 */

import type { components } from '@rescue-frontend/data-access/openapi';

import { formatTaiwanTime } from '../ticket/my-claims/my-claims';

/** One notification as `GET /notifications` sends it. */
export type NotificationRow = components['schemas']['NotificationItem'];

/** The kinds of notice the site shows, each with its own icon. */
export type SiteNoticeKind =
  | 'claimed'
  | 'assigned'
  | 'need-full'
  | 'called-off'
  | 'role-approved'
  | 'role-rejected';

/**
 * The backend's event types the site shows, and how each reads. A list of what to show rather than
 * of what to hide, so an event added later stays out until someone decides it is about the viewer.
 */
const SITE_NOTICE_KINDS: Partial<Record<string, SiteNoticeKind>> = {
  // To the requester: someone is coming, and who.
  task_claimed: 'claimed',
  // To the volunteer: a coordinator put them on a need.
  task_assignment_created: 'assigned',
  // To the volunteer: still on the list, go as planned.
  task_full: 'need-full',
  task_recruiting_stopped: 'need-full',
  // To the volunteer: no need to go.
  task_assignment_removed: 'called-off',
  task_deleted: 'called-off',
  ticket_deleted: 'called-off',
  // To the applicant, a team application's answer included.
  role_request_approved: 'role-approved',
  role_request_rejected: 'role-rejected',
};

/**
 * The kinds whose need is still on the viewer's lists — one they filed, or one they are on — so its
 * ticket can be opened. Called off means off the list or gone; an application is no need.
 */
const OPENS_ITS_NEED = new Set<SiteNoticeKind>([
  'claimed',
  'assigned',
  'need-full',
]);

/** A notice as the drawer shows it. */
export interface SiteNotice {
  uuid: string;
  kind: SiteNoticeKind;
  title: string;
  body: string;
  read: boolean;
  /** 「10/21 14:05」, or null for a notice with no time on it. */
  at: string | null;
  /** The need whose ticket a click opens, or null for a notice that opens nothing. */
  needUuid: string | null;
}

/** The notices the site shows, in the order the server sends them. */
export function readSiteNotices(
  rows: readonly NotificationRow[],
): SiteNotice[] {
  return rows.flatMap((row) => {
    const kind = SITE_NOTICE_KINDS[row.type];

    if (!kind) {
      return [];
    }

    return [
      {
        uuid: row.uuid,
        kind,
        title: row.title,
        body: row.body,
        read: row.read,
        at: formatTaiwanTime(row.created_at),
        needUuid:
          OPENS_ITS_NEED.has(kind) && row.ref_type === 'ticket_task'
            ? (row.ref_uuid ?? null)
            : null,
      },
    ];
  });
}

/** What 我的任務 reads (`MyTickets`, `MyTaskAssignments`), as far as finding a need's ticket goes. */
export interface ViewerNeedLists {
  requests: ReadonlyArray<{
    uuid: string;
    tasks: ReadonlyArray<{ uuid: string }>;
  }>;
  claims: ReadonlyArray<{ task: { uuid: string }; ticket: { uuid: string } }>;
}

/**
 * The ticket a need is on. A notice names the need (`ref_uuid`) and nothing reads one by its own
 * uuid, but every need a notice opens is on one of the viewer's lists: a requester hears about
 * needs they filed, a volunteer about needs they are on. Null once it is on neither — given back,
 * or deleted, since.
 */
export function ticketOfNeed(
  needUuid: string,
  { requests, claims }: ViewerNeedLists,
): string | null {
  const filed = requests.find((request) =>
    request.tasks.some((task) => task.uuid === needUuid),
  );

  if (filed) {
    return filed.uuid;
  }

  return (
    claims.find((claim) => claim.task.uuid === needUuid)?.ticket.uuid ?? null
  );
}

/**
 * The bell's count: the unread notices the drawer would show. `unread-count` counts every unread
 * notification, an announcement and the back office's included, so the site counts its own.
 */
export function countUnreadSiteNotices(
  rows: readonly NotificationRow[],
): number {
  return readSiteNotices(rows).filter((notice) => !notice.read).length;
}

/** The bell's badge: none at zero, and 9+ past nine, as the prototype's 16px dot holds. */
export function unreadBadgeText(count: number): string | null {
  if (count <= 0) {
    return null;
  }

  return count > 9 ? '9+' : String(count);
}

/** The bell's name, with the count the badge shows only to the eye. */
export function bellLabel(count: number): string {
  return count > 0 ? `通知，${count} 則未讀` : '通知';
}
