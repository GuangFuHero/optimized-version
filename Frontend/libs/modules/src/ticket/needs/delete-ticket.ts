/**
 * What the requester reads before deleting their whole ticket (B's S7): the 「刪除整張單」 of the
 * ⋯ at the top of its drawer.
 */

import type { TicketNeed } from './need-claim';

/** The line under the ticket's title in the confirmation. */
export function formatTicketNeedCount(count: number): string {
  return count > 0 ? `${count} 筆需求` : '沒有需求';
}

/**
 * The confirmation's explanation (team decision 2026-09-28: its needs go with it, and the people
 * on them hear). Who will hear is not counted: one volunteer may be on two of its needs and hears
 * once (`delete_ticket`), while each need only knows its own headcount.
 */
export function describeTicketDeletion(needs: readonly TicketNeed[]): string {
  let text =
    needs.length > 0
      ? `刪除後這張單和底下的 ${needs.length} 筆需求都會拿掉，無法復原。`
      : '刪除後這張單會拿掉，無法復原。';

  if (needs.some((need) => need.assignedCount > 0)) {
    text += '已承接的志工會收到通知，不用前往了。';
  }

  return text;
}
