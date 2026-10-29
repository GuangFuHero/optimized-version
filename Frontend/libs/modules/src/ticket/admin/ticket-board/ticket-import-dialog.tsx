'use client';

import {
  Box,
  Dialog as MuiDialog,
  IconButton,
  Typography,
} from '@mui/material';
import {
  useCommitTicketImport,
  useExportTickets,
  usePreviewTicketImport,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  TextInput,
} from '@rescue-frontend/ui';
import { CircleCheck, Download, FolderOpen, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDebounceCallback } from 'usehooks-ts';

import {
  ErrorList,
  ImportResult,
  Step,
  TypeChip,
} from '../../../admin/shared/import-dialog-parts';
import { Muted } from '../../../admin/shared/muted';
import {
  downloadBlob,
  importSummary,
} from '../../../admin/shared/model/bulk-import';
import { formatTicketTypeLabel } from '../../status';
import { NEED_KIND_ICONS } from './need-kind-icons';
import { ticketExportFilename } from './model/ticket-export';
import {
  IMPORT_NEED_TYPES,
  pastedCsvFile,
  ticketImportCaption,
} from './model/ticket-import';
import type { NeedType } from './model/ticket-row';

const { color, typography } = designTokens;

type Preview = components['schemas']['BulkPreviewResponse'];
type Result = components['schemas']['BulkImportResponse'];

/** Pasted text settles this long before it is sent for a preview. */
const PASTE_PREVIEW_DEBOUNCE_MS = 600;

/**
 * 匯入任務單, as the design draws it: 1 · the need type the file holds, 2 · the file, chosen or
 * pasted as CSV text, with that type's template (its 匯出), then the preview and 確認匯入.
 */
export function TicketImportDialog({ onClose }: { onClose: () => void }) {
  const [taskType, setTaskType] = useState<NeedType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The file the dialog shows now: a preview of any earlier one, landing late, is dropped.
  const latestFile = useRef<File | null>(null);
  const previewImport = usePreviewTicketImport();
  const commitImport = useCommitTicketImport();
  const exportTemplate = useExportTickets();
  const busy = previewImport.isPending || commitImport.isPending;
  // Closing mid-import would unmount the dialog: the import still happens, but its report is lost.
  // A preview in flight would land after the dialog is gone too, so both hold it open.
  const locked = busy;

  const previewFile = (nextFile: File | null) => {
    latestFile.current = nextFile;
    setFile(nextFile);
    setPreview(null);
    if (!nextFile || !taskType) return;
    previewImport.mutate(
      {
        params: { query: { task_type: taskType } },
        // The generated type says string; the serializer appends the File as-is.
        body: { file: nextFile as unknown as string },
      },
      {
        onSuccess: (data) => {
          if (latestFile.current === nextFile) setPreview(data);
        },
      },
    );
  };
  const previewPasted = useDebounceCallback(
    (text: string) => previewFile(pastedCsvFile(text)),
    PASTE_PREVIEW_DEBOUNCE_MS,
  );

  const chooseFile = (nextFile: File | undefined) => {
    if (!nextFile || !taskType) return;
    previewPasted.cancel();
    setPasted('');
    previewFile(nextFile);
  };

  const paste = (text: string) => {
    setPasted(text);
    // Typing replaces a chosen file; its preview no longer stands.
    latestFile.current = null;
    setFile(null);
    setPreview(null);
    previewPasted(text);
  };

  const chooseType = (type: NeedType) => {
    previewPasted.cancel();
    latestFile.current = null;
    setTaskType(type);
    setFile(null);
    setPasted('');
    setPreview(null);
  };

  const downloadTemplate = () => {
    if (!taskType) return;
    exportTemplate.mutate(
      { params: { query: { task_type: taskType, format: 'csv' } } },
      {
        onSuccess: (blob) => {
          downloadBlob(
            blob as Blob,
            ticketExportFilename(taskType, 'csv', new Date()),
          );
          toast.success(`已下載「${formatTicketTypeLabel(taskType)}」範本`);
        },
      },
    );
  };

  const commit = () => {
    if (!file || !taskType) return;
    commitImport.mutate(
      {
        params: { query: { task_type: taskType } },
        body: { file: file as unknown as string },
      },
      {
        onSuccess: (data) => {
          setResult(data);
          // The backend counts rows, and a ticket with three needs is three rows: 列, not 張.
          toast.success(
            data.updated > 0
              ? `已匯入：新增 ${data.created} 列、更新 ${data.updated} 列`
              : `已匯入：新增 ${data.created} 列`,
          );
        },
      },
    );
  };

  const summary = preview ? importSummary(preview) : null;
  const typeLabel = taskType ? formatTicketTypeLabel(taskType) : '';
  const pickFirst = taskType ? undefined : '先選這份檔案是哪一種需求';

  return (
    <MuiDialog
      open
      onClose={locked ? undefined : onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: 'min(760px, 96vw)', m: 0 } } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          p: '16px 22px',
          borderBottom: `1px solid ${color.border.default}`,
          color: color.fg.neutral.default,
        }}
      >
        {result ? <CircleCheck size={20} /> : <Upload size={20} />}
        <Typography
          sx={{
            ...typography.heading[600],
            color: color.fg.neutral.default,
            flex: 1,
          }}
        >
          {result ? '匯入完成' : '匯入任務單'}
        </Typography>
        <IconButton aria-label="關閉" onClick={onClose} disabled={locked}>
          <X size={20} />
        </IconButton>
      </Box>

      {result ? (
        <ImportResult
          result={result}
          onClose={onClose}
          createdUnit="列"
          showUpdated
          partialNote="任務單已寫入，但這一列的需求或需求欄位沒有寫完。請打開這些任務單核對需求與欄位後補齊。"
        />
      ) : (
        <>
          <Box
            sx={{
              p: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              overflow: 'auto',
            }}
          >
            <Step title="1 · 這份檔案是哪一種需求">
              <Box
                role="radiogroup"
                aria-label="需求種類"
                sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
              >
                {IMPORT_NEED_TYPES.map((type) => {
                  const KindIcon = NEED_KIND_ICONS[type];
                  return (
                    <TypeChip
                      key={type}
                      icon={KindIcon ? <KindIcon size={15} /> : undefined}
                      label={formatTicketTypeLabel(type)}
                      active={taskType === type}
                      // A preview still running would land after the switch cleared its file.
                      disabled={busy}
                      onSelect={() => chooseType(type)}
                    />
                  );
                })}
              </Box>
              <Muted>
                一個檔案只放一種需求；一列是一張單的一筆需求。同一張單有好幾筆需求，就寫好幾列、標題和電話相同。
              </Muted>
              <Callout tone="info">
                匯入的列還不會檢查是否與現有任務單重複，匯入前請先確認。
              </Callout>
            </Step>

            <Step
              title="2 · 上傳檔案"
              trailing={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    startIcon={<Download size={15} />}
                    title={pickFirst ?? '「匯出」這一種需求的 CSV，當作範本'}
                    onClick={downloadTemplate}
                    disabled={!taskType || exportTemplate.isPending}
                  >
                    {exportTemplate.isPending
                      ? '下載中…'
                      : taskType
                        ? `下載「${typeLabel}」範本`
                        : '下載範本'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    startIcon={<FolderOpen size={15} />}
                    title={pickFirst}
                    onClick={() => fileInput.current?.click()}
                    disabled={!taskType || busy}
                  >
                    選擇 CSV／Excel
                  </Button>
                </>
              }
            >
              <input
                ref={fileInput}
                type="file"
                hidden
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  chooseFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {file && !pasted ? (
                <Typography
                  sx={{
                    ...typography.data[300],
                    color: color.fg.neutral.muted,
                  }}
                >
                  已讀取：{file.name}
                </Typography>
              ) : null}
              <TextInput
                multiline
                minRows={3}
                aria-label="貼上 CSV 內容"
                placeholder={
                  pickFirst ?? '也可以直接貼上 CSV 內容（第一列是欄位名稱）'
                }
                value={pasted}
                disabled={!taskType || commitImport.isPending}
                onChange={(event) => paste(event.target.value)}
              />
              <Muted>{ticketImportCaption(taskType)}</Muted>
            </Step>

            {preview && summary ? (
              <Step
                title="3 · 試算結果"
                aside={
                  <>
                    <Muted>還沒寫入</Muted>
                    <Badge tone="success">新增 {summary.create} 列</Badge>
                    {summary.update > 0 ? (
                      <Badge tone="info">更新 {summary.update} 列</Badge>
                    ) : null}
                    {summary.failedLines > 0 ? (
                      <Badge tone="danger">失敗 {summary.failedLines} 列</Badge>
                    ) : null}
                  </>
                }
              >
                {preview.errors.length > 0 ? (
                  <ErrorList errors={preview.errors} />
                ) : null}
              </Step>
            ) : null}
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              p: '14px 22px',
              borderTop: `1px solid ${color.border.default}`,
            }}
          >
            <Muted sx={{ flex: 1 }}>
              {previewImport.isPending
                ? '試算中…'
                : commitImport.isPending
                  ? '匯入中…'
                  : summary
                    ? `新增 ${summary.create} 列・更新 ${summary.update} 列・失敗 ${summary.failedLines} 列（共 ${preview?.row_count ?? 0} 列）`
                    : ''}
            </Muted>
            <Button variant="ghost" onClick={onClose} disabled={locked}>
              取消
            </Button>
            <Button
              onClick={commit}
              startIcon={<Upload size={17} />}
              disabled={!summary?.canCommit || busy}
            >
              確認匯入
            </Button>
          </Box>
        </>
      )}
    </MuiDialog>
  );
}
