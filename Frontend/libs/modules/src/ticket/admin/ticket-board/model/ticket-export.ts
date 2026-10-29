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
