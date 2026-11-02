import type { TagFill, TagTone } from '@rescue-frontend/ui';

import type { TicketPriority } from './ticket-row';

/**
 * The admin board's words for the four priorities (任務管理.md 〈核心規則〉). The public site keeps
 * its own (`getTicketPriorityLabel` in status.ts: 最高優先／高優先), as its prototype names them.
 */
export const ADMIN_TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: '生命危急',
  high: '緊急',
  medium: '一般',
  low: '低',
};

/** A priority as the board names it; null for a value the backend does not store. */
export function adminTicketPriorityLabel(
  value: string | null | undefined,
): string | null {
  const key = value?.trim().toLowerCase();
  return key &&
    Object.prototype.hasOwnProperty.call(ADMIN_TICKET_PRIORITY_LABELS, key)
    ? ADMIN_TICKET_PRIORITY_LABELS[key as TicketPriority]
    : null;
}

export interface AdminPriorityTag {
  label: string;
  tone: TagTone;
  fill: TagFill;
}

/**
 * The tag a priority gets on the board (TAG-103, TAG-105): only 生命危急 is solid red, 緊急 is a
 * pale warning, and 一般 and 低 are quiet grey words; null for a value the backend does not store.
 */
export function adminTicketPriorityTag(
  value: string | null | undefined,
): AdminPriorityTag | null {
  const label = adminTicketPriorityLabel(value);
  if (!label) return null;
  switch (value?.trim().toLowerCase()) {
    case 'critical':
      return { label, tone: 'danger', fill: 'solid' };
    case 'high':
      return { label, tone: 'warning', fill: 'subtle' };
    default:
      return { label, tone: 'neutral', fill: 'quiet' };
  }
}
