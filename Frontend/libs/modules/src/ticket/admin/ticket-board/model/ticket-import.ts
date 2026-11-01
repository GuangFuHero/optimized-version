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

/**
 * The footer's caption: what the backend's ticket import requires of a row that creates a ticket
 * (`TICKET_COLUMNS` `required_on_create`: title, contact_name, latitude, longitude, task_name; and
 * task_quantity for every need, a rescue's too). The file has no address column.
 */
export function ticketImportCaption(taskType: string | null): string {
  const required = ['標題', '聯絡人', '緯度', '經度', '需求名稱', '需求數量'];
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

/**
 * The line under the dialog once a file is read. Rows held as suspected duplicates are not created
 * (ADR-398), so they count neither as new nor as updates, and the line names them apart.
 */
export function ticketImportSummaryLine(
  summary: {
    create: number;
    update: number;
    suspected: number;
    failedLines: number;
  },
  rowCount: number,
): string {
  const parts = [`新增 ${summary.create} 列`, `更新 ${summary.update} 列`];
  if (summary.suspected > 0) parts.push(`疑似重複 ${summary.suspected} 列`);
  parts.push(`失敗 ${summary.failedLines} 列`);
  return `${parts.join('・')}（共 ${rowCount} 列）`;
}
