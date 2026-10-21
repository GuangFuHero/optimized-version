import type { OperationalStatus } from '../../../operational-status';

/**
 * The endpoint returns category names through the backend's glossary (`chart_render._CATEGORY_LABEL`),
 * not the stored values, so its labels are read back here. A raw value still passes through.
 */
const STATUS_BY_BACKEND_LABEL: Record<string, OperationalStatus> = {
  營運中: 'active',
  暫停營運: 'temporarily_closed',
  永久關閉: 'permanently_closed',
};

/**
 * Station counts per operational status, from `/analytics/stations/data` (x=category). The ticket
 * names `/analytics/stations/value`, but that returns one ungrouped total with no per-status split.
 */
export function parseStatusCounts(data: {
  x_values: readonly (string | null)[];
  series: readonly { name?: string; values: readonly number[] }[];
}): Record<string, number> {
  const values = data.series[0]?.values ?? [];
  const counts: Record<string, number> = {};
  data.x_values.forEach((x, i) => {
    const key = x == null ? 'unknown' : (STATUS_BY_BACKEND_LABEL[x] ?? x);
    counts[key] = (counts[key] ?? 0) + (values[i] ?? 0);
  });
  return counts;
}
