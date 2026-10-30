import type { components } from '@rescue-frontend/data-access/openapi';

import type { StationRow } from './station-row';
import { taiwanDateParts } from '../../../../time';

type BulkPreview = components['schemas']['BulkPreviewResponse'];
type ErrorReport = components['schemas']['ErrorReportResponse'];

type StationImportField =
  | 'name'
  | 'type'
  | 'description'
  | 'op_hour'
  | 'level'
  | 'comment'
  | 'visibility'
  | 'latitude'
  | 'longitude'
  | 'address'
  | 'floor'
  | 'room';

/**
 * The system fields a station import column can map to (backend STATION_COLUMNS, writable).
 * `required` marks what a new station needs; the UI renders the mark, not the label.
 */
export const STATION_IMPORT_FIELDS: readonly {
  value: StationImportField;
  label: string;
  required?: boolean;
}[] = [
  { value: 'name', label: '站點名稱', required: true },
  { value: 'type', label: '類型' },
  { value: 'description', label: '說明' },
  { value: 'op_hour', label: '開放時間' },
  { value: 'level', label: 'level' },
  { value: 'comment', label: 'comment' },
  { value: 'visibility', label: '公開範圍' },
  { value: 'latitude', label: '緯度', required: true },
  { value: 'longitude', label: '經度', required: true },
  { value: 'address', label: '地址' },
  { value: 'floor', label: '樓' },
  { value: 'room', label: '室' },
];

/**
 * A starter file for a station import. The headers are the system field names, so the preview maps
 * them without help.
 */
export function stationImportTemplate(stationType: string): string {
  const example: Partial<Record<StationImportField, string>> = {
    name: '範例站點（改成實際名稱）',
    type: stationType,
    visibility: 'public',
    latitude: '23.6634',
    longitude: '121.4211',
    address: '花蓮縣光復鄉中正路一段31號',
  };
  const headers = STATION_IMPORT_FIELDS.map((f) => f.value);
  const row = headers.map((h) => csvCell(example[h] ?? ''));
  return `${headers.join(',')}\r\n${row.join(',')}\r\n`;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * What a preview adds up to. Suspected rows count neither as new nor as updates (ADR-398): only those
 * the importer files anyway (`filed`) will be written, so only they add to what the commit imports.
 */
export function importSummary(
  preview: Pick<
    BulkPreview,
    'to_create' | 'to_update' | 'errors' | 'suspected'
  >,
  filed: number,
) {
  const failedLines = new Set(preview.errors.map((e) => e.line)).size;
  const importable = preview.to_create + preview.to_update + filed;
  return {
    create: preview.to_create,
    update: preview.to_update,
    suspected: preview.suspected,
    filed,
    failedLines,
    importable,
    canCommit: importable > 0,
  };
}

/** A row error's column as the mapping names it: a field label, or the file's own header. */
export function importFieldLabel(column: string): string {
  if (!column) return '整列';
  return STATION_IMPORT_FIELDS.find((f) => f.value === column)?.label ?? column;
}

/** The `mapping` form field: the backend's suggestion with the user's changes (null = skip). */
export function mergeMapping(
  suggested: Record<string, string>,
  overrides: Record<string, string | null>,
): string {
  const merged: Record<string, string> = { ...suggested };
  for (const [header, field] of Object.entries(overrides)) {
    if (field) merged[header] = field;
    else delete merged[header];
  }
  return JSON.stringify(merged);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadBase64(report: ErrorReport) {
  const bytes = Uint8Array.from(atob(report.content_base64), (c) =>
    c.charCodeAt(0),
  );
  downloadBlob(new Blob([bytes], { type: report.media_type }), report.filename);
}

/**
 * Per-type counts of the stations an export will contain: the rows the backend says the export
 * includes. `station.export` reaches fewer stations than `station.view` for a team role, and
 * a gov team's reaches all of them, so the viewer's team alone cannot say which.
 */
export function countExportableByType(
  rows: readonly StationRow[],
): Map<string, number> {
  const byType = new Map<string, number>();
  for (const row of rows) {
    if (!row.canExport) continue;
    const type = row.type.trim().toLowerCase();
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }
  return byType;
}

export function exportFilename(
  typeLabel: string,
  format: 'csv' | 'xlsx',
  now: Date,
): string {
  const parts = taiwanDateParts(now);
  return `資源站點_${typeLabel}_${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}.${format}`;
}
