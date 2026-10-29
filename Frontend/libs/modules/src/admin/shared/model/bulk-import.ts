import type { components } from '@rescue-frontend/data-access/openapi';

type BulkPreview = components['schemas']['BulkPreviewResponse'];
type BulkResult = components['schemas']['BulkImportResponse'];
type ErrorReport = components['schemas']['ErrorReportResponse'];

/** A bulk import preview in counts: rows to create and update, lines that failed, and whether to go on. */
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

/**
 * A commit's failed rows split by what they left behind. `failed` counts every failed row, the
 * partial ones too: those wrote their main record before a later step failed, so they are in
 * the database but incomplete. The rest wrote nothing.
 */
export function importFailures(
  result: Pick<BulkResult, 'failed' | 'partial_rows'>,
) {
  const partialLines = [...new Set(result.partial_rows ?? [])].sort(
    (a, b) => a - b,
  );
  return {
    partialLines,
    unwritten: Math.max(0, result.failed - partialLines.length),
  };
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
