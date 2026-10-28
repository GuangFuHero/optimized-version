import { taiwanDateParts } from '../../../../time';
import { formatTicketTypeLabel } from '../../../status';

/** The task types a ticket export can be cut by (the backend's `task_type`). */
export const TICKET_EXPORT_TYPES = [
  'rescue',
  'supply',
  'medical',
  'hr',
] as const;

export type TicketExportType = (typeof TICKET_EXPORT_TYPES)[number];

export function ticketExportFilename(
  taskType: TicketExportType,
  format: 'csv' | 'xlsx',
  now: Date,
): string {
  const { year, month, day } = taiwanDateParts(now);
  return `求助單-${formatTicketTypeLabel(taskType)}-${year}${month}${day}.${format}`;
}
