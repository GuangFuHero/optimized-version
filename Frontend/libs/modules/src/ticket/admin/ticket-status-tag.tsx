'use client';

import { designTokens, Tag } from '@rescue-frontend/ui';

import { formatTicketStatusLabel } from '../status';

const { color } = designTokens;

/**
 * A ticket's status as the back office lists it (TAG-105): grey words, and only 待處理 strong, with
 * the small orange dot.
 */
export function TicketStatusTag({ status }: { status: string }) {
  const pending = status === 'pending';
  return (
    <Tag
      fill="quiet"
      strong={pending}
      dot={pending ? color.bg.primary.default : undefined}
    >
      {formatTicketStatusLabel(status)}
    </Tag>
  );
}
