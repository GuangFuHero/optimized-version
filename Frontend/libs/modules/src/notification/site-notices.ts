/**
 * The site's inbox (prototype `site-notify.jsx`): only what is about the viewer — someone coming to
 * a need they filed, a change to a need they said they would go to, a duplicate review folding their
 * ticket or need into another, a data check questioning a ticket they filed or are going to, and the
 * answer to their own application. The prototype has no notice for the duplicate review or the data
 * check. A site-wide announcement is sent to every account too, but it has the banner, and the back
 * office's notices wait for its own bell (C-2: an inbox mixed with broadcasts dulls both).
 */

import type {
  MyTaskAssignmentsQuery,
  MyTicketsQuery,
} from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import { formatTaiwanTime } from '../time';

/** One notification as `GET /notifications` sends it. */
export type NotificationRow = components['schemas']['NotificationItem'];

/** The kinds of notice the site shows, each with its own icon. */
export type SiteNoticeKind =
  | 'claimed'
  | 'assigned'
  | 'need-full'
  | 'called-off'
  | 'merged'
  | 'audit-issue'
  | 'role-approved'
  | 'role-rejected';

/**
 * What a click on a notice opens. `need`: the ticket of the need it names, while that need is still
 * on the viewer's lists — one they filed, or one they are on. `ticket`: the ticket it names, which
 * is still there. Neither, for a need called off or gone, and for an application, which is no need.
 */
type Opens = 'need' | 'ticket';

/**
 * The backend's event types the site shows, how each reads, and what it opens. A list of what to
 * show rather than of what to hide, so an event added later stays out until someone decides it is
 * about the viewer.
 */
const SITE_NOTICE_TYPES: Partial<
  Record<string, { kind: SiteNoticeKind; opens?: Opens }>
> = {
  // To the requester: someone is coming, and who.
  task_claimed: { kind: 'claimed', opens: 'need' },
  // To the volunteer: a coordinator put them on a need.
  task_assignment_created: { kind: 'assigned', opens: 'need' },
  // To the volunteer: still on the list, go as planned.
  task_full: { kind: 'need-full', opens: 'need' },
  task_recruiting_stopped: { kind: 'need-full', opens: 'need' },
  // To the volunteer: no need to go. `ticket_deleted` names its ticket, which is gone.
  task_assignment_removed: { kind: 'called-off' },
  task_deleted: { kind: 'called-off' },
  ticket_deleted: { kind: 'called-off' },
  // A duplicate review folded one ticket into another (Spec 028 §6). Each names the ticket kept,
  // where everyone now looks: the other one is cancelled.
  // To the volunteer: their need moved onto the ticket kept, and they still go.
  dedup_task_merged: { kind: 'merged', opens: 'ticket' },
  // To the volunteer: their need was cancelled, and the ticket kept handles it now.
  dedup_task_canceled: { kind: 'called-off', opens: 'ticket' },
  // To the volunteers already on the ticket kept: its contact changed, and they still go.
  dedup_ticket_contact_changed: { kind: 'merged', opens: 'ticket' },
  // To the requester whose ticket was folded in, and to the one whose ticket took it in.
  dedup_ticket_merged: { kind: 'merged', opens: 'ticket' },
  dedup_ticket_updated: { kind: 'merged', opens: 'ticket' },
  // A data check found something wrong with a ticket (backend `ticket_audit.py`), and the notice
  // names it. To the requester, that staff are looking into it, and to those on its needs, who may
  // be on their way. Neither says what was wrong: the auditor's note is for staff.
  ticket_audit_issue: { kind: 'audit-issue', opens: 'ticket' },
  // To the applicant, a team application's answer included.
  role_request_approved: { kind: 'role-approved' },
  role_request_rejected: { kind: 'role-rejected' },
};

/** A notice as the drawer shows it: four of the row's fields as they come, the rest the site's own. */
export interface SiteNotice
  extends Pick<NotificationRow, 'uuid' | 'title' | 'body' | 'read'> {
  kind: SiteNoticeKind;
  /** 「10/21 14:05」, or null for a notice with no time on it. */
  at: string | null;
  /** The need whose ticket a click opens, found on the viewer's lists (`ticketOfNeed`). */
  needUuid: string | null;
  /** The ticket a click opens, named by the notice itself. */
  ticketUuid: string | null;
}

/** The notices the site shows, in the order the server sends them. */
export function readSiteNotices(
  rows: readonly NotificationRow[],
): SiteNotice[] {
  return rows.flatMap((row) => {
    const type = SITE_NOTICE_TYPES[row.type];

    if (!type) {
      return [];
    }

    const names = (opens: Opens, refType: string) =>
      type.opens === opens && row.ref_type === refType
        ? (row.ref_uuid ?? null)
        : null;

    return [
      {
        uuid: row.uuid,
        kind: type.kind,
        title: row.title,
        body: row.body,
        read: row.read,
        at: formatTaiwanTime(row.created_at),
        needUuid: names('need', 'ticket_task'),
        ticketUuid: names('ticket', 'ticket'),
      },
    ];
  });
}

type FiledTicket = MyTicketsQuery['myTickets'][number];
type Claim = MyTaskAssignmentsQuery['myTaskAssignments'][number];

/**
 * What 我的任務 reads (`MyTickets`, `MyTaskAssignments`), as far as finding a need's ticket goes:
 * only the uuids, so a caller need not have the rest of either query.
 */
export interface ViewerNeedLists {
  requests: ReadonlyArray<
    Pick<FiledTicket, 'uuid'> & {
      tasks: ReadonlyArray<Pick<FiledTicket['tasks'][number], 'uuid'>>;
    }
  >;
  claims: ReadonlyArray<{
    task: Pick<Claim['task'], 'uuid'>;
    ticket: Pick<Claim['ticket'], 'uuid'>;
  }>;
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

/** `rows` with those in `uuids` read, or unread again: what the drawer's cache holds meanwhile. */
export function withReadState(
  rows: readonly NotificationRow[],
  uuids: readonly string[],
  read: boolean,
): NotificationRow[] {
  const changing = new Set(uuids);

  return rows.map((row) => (changing.has(row.uuid) ? { ...row, read } : row));
}

/**
 * Those of `uuids` the backend did not mark read — a PATCH that failed, offline or a 5xx — from what
 * each of their PATCHes came to, in the same order.
 */
export function notMarkedRead(
  uuids: readonly string[],
  results: readonly PromiseSettledResult<unknown>[],
): string[] {
  return uuids.filter((_, index) => results[index]?.status !== 'fulfilled');
}

/** The bell's name, with the count the badge shows only to the eye. */
export function bellLabel(count: number): string {
  return count > 0 ? `通知，${count} 則未讀` : '通知';
}
