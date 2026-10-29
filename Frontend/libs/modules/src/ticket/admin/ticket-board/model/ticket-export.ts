import { taiwanDateParts } from '../../../../time';
import { formatTicketTypeLabel } from '../../../status';
import type { NeedType } from './ticket-row';

export function ticketExportFilename(
  taskType: NeedType,
  format: 'csv' | 'xlsx',
  now: Date,
): string {
  const { year, month, day } = taiwanDateParts(now);
  return `求助單-${formatTicketTypeLabel(taskType)}-${year}${month}${day}.${format}`;
}
