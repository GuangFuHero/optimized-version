import type { components } from '@rescue-frontend/data-access/openapi';

type BulkPreview = components['schemas']['BulkPreviewResponse'];
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
