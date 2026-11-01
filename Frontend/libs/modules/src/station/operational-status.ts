import type { BadgeTone } from '@rescue-frontend/ui';

export type OperationalStatus =
  | 'active'
  | 'temporarily_closed'
  | 'permanently_closed';

/**
 * Labels for the backend's three operational states: 開設中／暫停服務／已關閉, the last two as the
 * public site says them. Their tags are always pale (TAG-103).
 */
export const OPERATIONAL_STATUS_OPTIONS: readonly {
  value: OperationalStatus;
  label: string;
  tone: 'success' | 'warning' | 'neutral';
}[] = [
  { value: 'active', label: '開設中', tone: 'success' },
  { value: 'temporarily_closed', label: '暫停服務', tone: 'warning' },
  { value: 'permanently_closed', label: '已關閉', tone: 'neutral' },
];

export function getOperationalStatusMeta(value: string | null | undefined): {
  value: string;
  label: string;
  tone: BadgeTone;
} {
  if (!value) return { value: '', label: '—', tone: 'neutral' };
  const option = OPERATIONAL_STATUS_OPTIONS.find((o) => o.value === value);
  return option ?? { value, label: value, tone: 'neutral' };
}
