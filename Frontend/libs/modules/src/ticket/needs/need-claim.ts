/**
 * What a need's claim button says and does. A volunteer claims a need — one `ticket_tasks` row —
 * never a whole ticket (PUB-PS-140).
 */

/** The fields of a need (`TicketNeedFields` in `tickets.graphql`) that decide its button. */
export interface TicketNeed {
  uuid: string;
  taskName: string;
  taskType: string;
  quantity?: number | null;
  status: string;
  assignedCount: number;
  /** The viewer's own claim — null to a guest and to anyone who has not claimed the need. */
  myAssignment?: { uuid: string } | null;
}

export type NeedClaimKind = 'fulfilled' | 'mine' | 'full' | 'guest' | 'open';

export interface NeedClaim {
  kind: NeedClaimKind;
  label: string;
  /** What pressing the button does; null when it cannot be pressed. */
  action: 'claim' | 'sign-in' | null;
}

/**
 * The backend's cap (`_lock_task_with_room`): full once `quantity` people have claimed it. A need
 * without a quantity has no cap — the requester never said how many.
 */
export function isNeedFull(need: TicketNeed): boolean {
  return need.quantity != null && need.assignedCount >= need.quantity;
}

export function resolveNeedClaim(
  need: TicketNeed,
  viewer: { isAuthenticated: boolean; ticketStatus?: string | null },
): NeedClaim {
  // No 已取消: a need or ticket is cancelled only by deleting it now, and nothing deleted is ever
  // returned (Q43). One cancelled by hand before then reads as any other, and the backend refuses
  // a claim on it.

  // First the viewer's own claim, even on a need that has since filled or stopped recruiting: they
  // are among the people it has, and still go (Q26).
  if (need.myAssignment) {
    return { kind: 'mine', label: '已承接', action: null };
  }

  // Filled by claims or stopped by its requester (Q37, Q39) — not 已完成, since nobody on it has gone
  // yet (Q42). A ticket's status follows its needs (Q44), so a completed one has none open; one
  // closed by hand before then left its needs pending, and the backend's claim check refuses them.
  if (need.status === 'fulfilled' || viewer.ticketStatus === 'completed') {
    return { kind: 'fulfilled', label: '已滿足需求', action: null };
  }

  if (isNeedFull(need)) {
    return { kind: 'full', label: '已滿', action: null };
  }

  if (!viewer.isAuthenticated) {
    return { kind: 'guest', label: '登入後接', action: 'sign-in' };
  }

  return { kind: 'open', label: '接這筆', action: 'claim' };
}

export interface NeedQuota {
  text: string;
  /** How much of the progress bar to fill, 0–1; null draws no bar. */
  fraction: number | null;
}

export function formatNeedQuota(need: TicketNeed, kind: NeedClaimKind): NeedQuota {
  const quantity = need.quantity;

  // No cap and no denominator — a bar would have to invent one (the prototype counted it as 1).
  if (quantity == null) {
    return { text: `未填數量 · 已 ${need.assignedCount} 人`, fraction: null };
  }

  const count = `${need.assignedCount}/${quantity}`;

  // Full can mean over-sent, from before coordinators were capped too (Q38): the count says so, the
  // bar stays full.
  if (isNeedFull(need)) {
    return { text: `${count} 已滿`, fraction: 1 };
  }

  // A need that has its people is missing nobody, however few went.
  if (kind === 'fulfilled') {
    return { text: count, fraction: need.assignedCount / quantity };
  }

  return {
    text: `${count} · 缺 ${quantity - need.assignedCount}`,
    fraction: need.assignedCount / quantity,
  };
}

/**
 * The line the claim confirmation reads out before a volunteer commits (prototype
 * `NeedClaimConfirmDialog`).
 */
export function formatNeedHeadcount(need: TicketNeed, kind: NeedClaimKind): string {
  const quantity = need.quantity;

  if (quantity == null) {
    return `目前 ${need.assignedCount} 人（未填數量）`;
  }

  const count = `目前 ${need.assignedCount}/${quantity} 人`;

  // Same order as formatNeedQuota: a full need says so even once it closed.
  if (isNeedFull(need)) {
    return `${count}，已滿`;
  }

  if (kind === 'fulfilled') {
    return count;
  }

  return `${count}，還缺 ${quantity - need.assignedCount} 位`;
}
