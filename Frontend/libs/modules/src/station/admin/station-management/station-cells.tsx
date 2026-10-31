'use client';

import { Badge } from '@rescue-frontend/ui';

import { getOperationalStatusMeta } from '../../operational-status';

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const meta = getOperationalStatusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
