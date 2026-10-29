import type { components } from '@rescue-frontend/data-access/openapi';

import { taiwanDateParts } from '../../../../time';
import { needTypeLabel, type NeedType } from './ticket-row';

export function ticketExportFilename(
  taskType: NeedType,
  format: 'csv' | 'xlsx',
  now: Date,
): string {
  const { year, month, day } = taiwanDateParts(now);
  return `任務單-${needTypeLabel(taskType)}-${year}${month}${day}.${format}`;
}

/** 下載範本's file: one type's header row, named as the station import's template is. */
export function ticketImportTemplateFilename(taskType: NeedType): string {
  return `任務單匯入範本_${needTypeLabel(taskType)}.csv`;
}

/** `GET /bulk/tickets/export/counts`: rows per type (a type with none is absent), and the cap. */
type TicketExportCounts = components['schemas']['TicketExportCountsResponse'];

/**
 * One type's line in 匯出: its rows (null until the counts arrive), and whether they pass the cap,
 * past which the backend refuses that type's export.
 */
export function exportTypeCount(
  answer: TicketExportCounts | undefined,
  type: NeedType,
): { count: number | null; overCap: boolean } {
  if (!answer) return { count: null, overCap: false };
  const count = answer.counts[type] ?? 0;
  return { count, overCap: count > answer.max_rows };
}

/** What a type past the cap says in place of its count. */
export function exportCapLabel(maxRows: number): string {
  return `超過 ${maxRows.toLocaleString('en-US')} 筆，無法匯出`;
}
