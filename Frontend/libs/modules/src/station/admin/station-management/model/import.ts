import type { components } from '@rescue-frontend/data-access/openapi';

import type { StationRow } from './station-row';

type BulkPreview = components['schemas']['BulkPreviewResponse'];
type ErrorReport = components['schemas']['ErrorReportResponse'];
type RowError = components['schemas']['RowErrorResponse'];

type StationImportField =
  | 'name'
  | 'type'
  | 'description'
  | 'op_hour'
  | 'level'
  | 'comment'
  | 'source'
  | 'visibility'
  | 'latitude'
  | 'longitude'
  | 'county'
  | 'city'
  | 'lane'
  | 'alley'
  | 'no'
  | 'floor'
  | 'room';

const ADDRESS_FIELDS: readonly StationImportField[] = [
  'county',
  'city',
  'lane',
  'alley',
  'no',
  'floor',
  'room',
];

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
  { value: 'source', label: '來源' },
  { value: 'visibility', label: '公開範圍' },
  { value: 'latitude', label: '緯度', required: true },
  { value: 'longitude', label: '經度', required: true },
  { value: 'county', label: '縣市' },
  { value: 'city', label: '鄉鎮市區' },
  { value: 'lane', label: '路街' },
  { value: 'alley', label: '巷弄' },
  { value: 'no', label: '號' },
  { value: 'floor', label: '樓' },
  { value: 'room', label: '室' },
];

/**
 * A starter file for a station import. The backend stores `source` from each row and falls back
 * to "import" when it is empty, so the example row carries `official`: every station added from
 * the admin portal is official (decided 2026-10-15). The headers are the system field names, so
 * the preview maps them without help.
 */
export function stationImportTemplate(stationType: string): string {
  const example: Partial<Record<StationImportField, string>> = {
    name: '範例站點（改成實際名稱）',
    type: stationType,
    source: 'official',
    visibility: 'public',
    latitude: '23.6634',
    longitude: '121.4211',
    county: '花蓮縣',
    city: '光復鄉',
  };
  const headers = STATION_IMPORT_FIELDS.map((f) => f.value);
  const row = headers.map((h) => csvCell(example[h] ?? ''));
  return `${headers.join(',')}\r\n${row.join(',')}\r\n`;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 records: quoted fields may hold commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function toCsv(records: readonly (readonly string[])[]): string {
  return records.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const OFFICIAL_SOURCE = 'official';

/**
 * The CSV with `source = official` on every row, and the mapping that reads it: every station
 * added from the admin portal is official (decided 2026-10-15), and the backend stores "import"
 * for a row whose source is empty. A column already mapped to source is overwritten; otherwise
 * one is appended. Headers and rows are read the way the backend reads them (headers trimmed,
 * trailing blank headers dropped, rows cut or padded to the headers), and blank rows stay blank
 * so the backend still skips them.
 */
export function withOfficialSource(
  text: string,
  mapping: Readonly<Record<string, string>>,
): { text: string; mapping: Record<string, string> } {
  const [headerRecord = [], ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
  const headers = headerRecord.map((h) => h.trim());
  while (headers.length && headers[headers.length - 1] === '') headers.pop();

  const nextMapping = { ...mapping };
  let sourceColumns = headers.flatMap((h, i) =>
    mapping[h] === 'source' ? [i] : [],
  );
  if (sourceColumns.length === 0) {
    let header = 'source';
    while (headers.includes(header)) header = `${header}_`;
    sourceColumns = [headers.length];
    headers.push(header);
    nextMapping[header] = 'source';
  }

  const width = headers.length;
  const records = rows.map((row) => {
    if (row.slice(0, width).every((cell) => cell === '')) return [];
    const cells = Array.from({ length: width }, (_, i) => row[i] ?? '');
    for (const column of sourceColumns) cells[column] = OFFICIAL_SOURCE;
    return cells;
  });
  return { text: toCsv([headers, ...records]), mapping: nextMapping };
}

/** Whether the backend reads this upload as CSV (it goes by the file extension). */
export function isCsvFile(file: Pick<File, 'name'>): boolean {
  return file.name.toLowerCase().endsWith('.csv');
}

/**
 * An .xlsx can't be rewritten here, so it has to carry the source itself: a column mapped to
 * source, reading official on every row the preview shows. Rows past the sample can't be checked.
 */
export function lacksOfficialSource(
  preview: Pick<BulkPreview, 'sample_rows'>,
  mapping: Readonly<Record<string, string>>,
): boolean {
  const columns = Object.keys(mapping).filter((h) => mapping[h] === 'source');
  if (columns.length === 0) return true;
  return preview.sample_rows.some((row) =>
    columns.some((h) => (row[h] ?? '').trim() !== OFFICIAL_SOURCE),
  );
}

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

export interface PreviewRow {
  /** Spreadsheet line, counting the header as line 1 (the backend's numbering). */
  line: number;
  name: string;
  type: string;
  address: string;
  errors: string[];
}

/**
 * The backend's sample rows (the file's first rows, keyed by file header) read through the
 * mapping, each with the errors reported for its line.
 */
export function previewRows(
  preview: Pick<BulkPreview, 'sample_rows' | 'errors'>,
  mapping: Record<string, string>,
): PreviewRow[] {
  return preview.sample_rows.map((raw, index) => {
    const line = index + 2;
    const byField: Record<string, string> = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = mapping[header];
      if (field) byField[field] = value.trim();
    }
    return {
      line,
      name: byField['name'] ?? '',
      type: byField['type'] ?? '',
      address: ADDRESS_FIELDS.map((f) => byField[f] ?? '').join(''),
      errors: preview.errors
        .filter((e) => e.line === line)
        .map((e) => (e.column ? `${e.column}：${e.message}` : e.message)),
    };
  });
}

/** Errors on lines past the sample, which the row list cannot show. */
export function errorsOutsideSample(
  preview: Pick<BulkPreview, 'sample_rows' | 'errors'>,
): RowError[] {
  const lastSampleLine = preview.sample_rows.length + 1;
  return preview.errors.filter((e) => e.line > lastSampleLine);
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

function taipeiParts(now: Date): Record<string, string> {
  return Object.fromEntries(
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
}

/**
 * Per-type counts of the stations an export will contain. An identity on a team exports only the
 * stations assigned to that team (`station.export` is team-scoped for team roles, while
 * `station.view` reaches every station); an identity with no team exports everything it sees.
 * `/users/me` doesn't carry the scope itself, so the team stands in for it.
 */
export function countExportableByType(
  rows: readonly StationRow[],
  activeTeamUuid: string | null,
): Map<string, number> {
  const byType = new Map<string, number>();
  for (const row of rows) {
    if (activeTeamUuid && row.teamUuid !== activeTeamUuid) continue;
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
  const parts = taipeiParts(now);
  return `資源站點_${typeLabel}_${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}.${format}`;
}
