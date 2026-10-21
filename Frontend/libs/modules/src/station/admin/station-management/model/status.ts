import type { BadgeTone } from '@rescue-frontend/ui';

export type OperationalStatus =
  | 'active'
  | 'temporarily_closed'
  | 'permanently_closed';

/**
 * Labels for the backend's three operational states. Provisional: whether the page shows three
 * states or the prototype's two (開設中／已關閉) is still to be decided, so change them only here.
 */
export const OPERATIONAL_STATUS_OPTIONS: readonly {
  value: OperationalStatus;
  label: string;
  tone: 'success' | 'warning' | 'neutral';
}[] = [
  { value: 'active', label: '開設中', tone: 'success' },
  { value: 'temporarily_closed', label: '暫時關閉', tone: 'warning' },
  { value: 'permanently_closed', label: '永久關閉', tone: 'neutral' },
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

/** Station counts per operational status, from `/analytics/stations/data` (x=category). */
export function parseStatusCounts(data: {
  x_values: readonly (string | null)[];
  series: readonly { name?: string; values: readonly number[] }[];
}): Record<string, number> {
  const values = data.series[0]?.values ?? [];
  return Object.fromEntries(
    data.x_values.map((x, i) => [x ?? 'unknown', values[i] ?? 0]),
  );
}
