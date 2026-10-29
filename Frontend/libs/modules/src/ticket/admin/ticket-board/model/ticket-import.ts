import { needTypeLabel, type NeedType } from './ticket-row';

/**
 * The import dialog's need-type chips, in the design's order (搜救／人力／物資), then 醫療, which
 * the backend imports too (`TASK_TYPES`) though the prototype draws no chip for it.
 */
export const IMPORT_NEED_TYPES: readonly NeedType[] = [
  'rescue',
  'hr',
  'supply',
  'medical',
];

/** The need types whose new needs may leave the head count blank (`QUANTITY_OPTIONAL_TASK_TYPES`). */
const QUANTITY_OPTIONAL: ReadonlySet<string> = new Set(['rescue']);

/**
 * The footer's caption: what the backend's ticket import requires of a row that creates a ticket
 * (`TICKET_COLUMNS` `required_on_create`: title, contact_name, latitude, longitude, task_name; and
 * task_quantity for any need but a rescue). The file has no address column.
 */
export function ticketImportCaption(taskType: string | null): string {
  const required = ['標題', '聯絡人', '緯度', '經度', '需求名稱'];
  if (taskType && !QUANTITY_OPTIONAL.has(taskType)) required.push('需求數量');
  const lead = taskType
    ? `從「匯出」下載的「${needTypeLabel(taskType)}」檔案就是範本。`
    : '從「匯出」下載的檔案就是範本。';
  return `${lead}新的單必填：${required.join('、')}。位置用經緯度，沒有地址欄。`;
}

/** Pasted CSV text as the file the import endpoints take; null when nothing but blanks was pasted. */
export function pastedCsvFile(text: string): File | null {
  if (!text.trim()) return null;
  return new File([text], 'pasted.csv', { type: 'text/csv' });
}
