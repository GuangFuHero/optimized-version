import type { BadgeTone, BadgeVariant } from '@rescue-frontend/ui';

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

export interface AdminPriorityBadge {
  label: string;
  tone: BadgeTone;
  variant: BadgeVariant;
}

/**
 * The badge a priority gets on the board (prototype `PriorityBadge`): only 生命危急 is solid red,
 * 緊急 is a subtle warning; 一般 and 低 get no badge and show as plain muted words.
 */
export function adminTicketPriorityBadge(
  value: string | null | undefined,
): AdminPriorityBadge | null {
  switch (value?.trim().toLowerCase()) {
    case 'critical':
      return {
        label: ADMIN_TICKET_PRIORITY_LABELS.critical,
        tone: 'danger',
        variant: 'solid',
      };
    case 'high':
      return {
        label: ADMIN_TICKET_PRIORITY_LABELS.high,
        tone: 'warning',
        variant: 'subtle',
      };
    default:
      return null;
  }
}
