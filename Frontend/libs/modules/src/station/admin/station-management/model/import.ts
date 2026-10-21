import type { components } from '@rescue-frontend/data-access/openapi';

type BulkPreview = components['schemas']['BulkPreviewResponse'];
type ErrorReport = components['schemas']['ErrorReportResponse'];

/** The system fields a station import column can map to (backend STATION_COLUMNS, writable). */
export const STATION_IMPORT_FIELDS = [
  { value: 'name', label: '站點名稱 *' },
  { value: 'type', label: '類型' },
  { value: 'description', label: '說明' },
  { value: 'op_hour', label: '開放時間' },
  { value: 'level', label: 'level' },
  { value: 'comment', label: 'comment' },
  { value: 'source', label: '來源' },
  { value: 'visibility', label: '公開範圍' },
  { value: 'latitude', label: '緯度 *' },
  { value: 'longitude', label: '經度 *' },
  { value: 'county', label: '縣市' },
  { value: 'city', label: '鄉鎮市區' },
  { value: 'lane', label: '路街' },
  { value: 'alley', label: '巷弄' },
  { value: 'no', label: '號' },
  { value: 'floor', label: '樓' },
  { value: 'room', label: '室' },
] as const;

export function importSummary(
  preview: Pick<BulkPreview, 'to_create' | 'to_update' | 'errors'>,
) {
  const failedLines = new Set(preview.errors.map((e) => e.line)).size;
  return {
    create: preview.to_create,
    update: preview.to_update,
    failedLines,
    canCommit: preview.to_create + preview.to_update > 0,
  };
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
  const bytes = Uint8Array.from(atob(report.content_base64), (c) => c.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: report.media_type }), report.filename);
}

export function exportFilename(
  typeLabel: string,
  format: 'csv' | 'xlsx',
  now: Date,
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `資源站點_${typeLabel}_${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}.${format}`;
}
