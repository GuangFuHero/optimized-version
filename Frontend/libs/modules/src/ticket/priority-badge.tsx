'use client';

import { Badge, type BadgeVariant } from '@rescue-frontend/ui';

import { getTicketPriorityBadge } from './status';

/**
 * A ticket's 最高優先 or 高優先 (`getTicketPriorityBadge`), and nothing below high. `high` is how a
 * high one shows: solid on a list card, subtle elsewhere.
 */
export function TicketPriorityBadge({
  priority,
  high,
}: {
  priority?: string | null;
  high?: BadgeVariant;
}) {
  const badge = getTicketPriorityBadge(priority, { high });

  return badge ? (
    <Badge tone={badge.tone} variant={badge.variant}>
      {badge.label}
    </Badge>
  ) : null;
}
