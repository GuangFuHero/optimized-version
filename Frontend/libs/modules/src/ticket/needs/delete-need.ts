/**
 * What the requester reads before deleting one of their ticket's needs (B's S5): the 「刪除這筆需求」
 * of the need's ⋯, next to 停止招募.
 */

import type { TicketNeed } from './need-claim';

/**
 * The need statuses that still take people — the backend's `OPEN_NEED_STATUSES`
 * (`services/ticket_status.py`). `in_progress` is gone from new needs, but rows written before
 * still carry it, and the backend still counts them open.
 */
const OPEN_NEED_STATUSES = new Set(['pending', 'in_progress']);

function isNeedOpen(need: TicketNeed): boolean {
  return OPEN_NEED_STATUSES.has(need.status);
}

/**
 * The confirmation's explanation, under the need's name: that it goes for good; who on it hears
 * they need not go (`delete_ticket_task` tells each of them); and, when it is the last need still
 * looking for people, that the ticket turns 已完成 — the backend works a ticket's status out from its
 * needs, and with none open that is completed — and that 「再加一件」 brings it back.
 *
 * `needs` is the ticket's needs as last read, with or without this one in it.
 */
export function describeNeedDeletion(
  need: TicketNeed,
  needs: readonly TicketNeed[],
): string {
  let text = '刪除後這筆需求會從單上拿掉，無法復原。';

  if (need.assignedCount > 0) {
    text += `已承接的 ${need.assignedCount} 位志工會收到通知，不用前往了。`;
  }

  // A need with its people already leaves the ticket as it is: with no other open need, it is
  // completed already.
  const othersOpen = needs.some(
    (other) => other.uuid !== need.uuid && isNeedOpen(other),
  );

  if (isNeedOpen(need) && !othersOpen) {
    text +=
      '這是最後一筆還在找人的需求，刪除後這張單會變成「已完成」；之後還需要幫忙，可以再加一件。';
  }

  return text;
}
