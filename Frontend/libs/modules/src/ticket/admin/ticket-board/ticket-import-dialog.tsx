'use client';

import {
  Box,
  Dialog as MuiDialog,
  IconButton,
  Typography,
} from '@mui/material';
import {
  useCommitTicketImport,
  usePreviewTicketImport,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import { Badge, Button, designTokens } from '@rescue-frontend/ui';
import { CircleCheck, FolderOpen, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ErrorList,
  ImportResult,
  Step,
  TypeChip,
} from '../../../admin/shared/import-dialog-parts';
import { Muted } from '../../../admin/shared/muted';
import { importSummary } from '../../../admin/shared/model/bulk-import';
import { formatTicketTypeLabel } from '../../status';
import { TICKET_EXPORT_TYPES } from './model/ticket-export';

const { color, typography } = designTokens;

type Preview = components['schemas']['BulkPreviewResponse'];
type Result = components['schemas']['BulkImportResponse'];

export function TicketImportDialog({ onClose }: { onClose: () => void }) {
  const [taskType, setTaskType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewImport = usePreviewTicketImport();
  const commitImport = useCommitTicketImport();
  const busy = previewImport.isPending || commitImport.isPending;
  // Closing mid-import would unmount the dialog: the import still happens, but its report is lost.
  // A preview in flight would land after the dialog is gone too, so both hold it open.
  const locked = busy;

  const chooseFile = (nextFile: File | undefined) => {
    if (!nextFile || !taskType) return;
    setFile(nextFile);
    setPreview(null);
    previewImport.mutate(
      {
        params: { query: { task_type: taskType } },
        // The generated type says string; the serializer appends the File as-is.
        body: { file: nextFile as unknown as string },
      },
      { onSuccess: (data) => setPreview(data) },
    );
  };

  const chooseType = (type: string) => {
    setTaskType(type);
    setFile(null);
    setPreview(null);
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
          toast.success(
            data.updated > 0
              ? `已匯入：新增 ${data.created} 張、更新 ${data.updated} 張`
              : `已匯入：新增 ${data.created} 張`,
          );
        },
      },
    );
  };

  const summary = preview ? importSummary(preview) : null;
  const typeLabel = taskType ? formatTicketTypeLabel(taskType) : '';

  return (
    <MuiDialog
      open
      onClose={locked ? undefined : onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: 'min(640px, 96vw)', m: 0 } } }}
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
          {result ? '匯入完成' : '匯入求助單'}
        </Typography>
        <IconButton aria-label="關閉" onClick={onClose} disabled={locked}>
          <X size={20} />
        </IconButton>
      </Box>

      {result ? (
        <ImportResult result={result} onClose={onClose} createdUnit="張" />
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
            <Step
              title="1 · 這份檔案是哪一種任務"
              caption="一個檔案只放一種任務類型；一列是一張求助單。"
            >
              <Box
                role="radiogroup"
                aria-label="任務類型"
                sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
              >
                {TICKET_EXPORT_TYPES.map((type) => (
                  <TypeChip
                    key={type}
                    label={formatTicketTypeLabel(type)}
                    active={taskType === type}
                    // A preview still running would land after the switch cleared its file.
                    disabled={busy}
                    onSelect={() => chooseType(type)}
                  />
                ))}
              </Box>
            </Step>

            {taskType ? (
              <Step
                title="2 · 上傳檔案"
                trailing={
                  <Button
                    variant="outline"
                    size="sm"
                    startIcon={<FolderOpen size={15} />}
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                  >
                    選擇 CSV／Excel
                  </Button>
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
                {file ? (
                  <Typography
                    sx={{
                      ...typography.data[300],
                      color: color.fg.neutral.muted,
                    }}
                  >
                    已讀取：{file.name}
                  </Typography>
                ) : null}
                <Muted>
                  從「匯出」下載的「{typeLabel}
                  」檔案就是範本。欄位依檔案的表頭自動對應。
                </Muted>
              </Step>
            ) : null}

            {preview && summary ? (
              <Step
                title="3 · 試算結果"
                aside={
                  <>
                    <Muted>還沒寫入</Muted>
                    <Badge tone="success">新增 {summary.create}</Badge>
                    {summary.update > 0 ? (
                      <Badge tone="info">更新 {summary.update}</Badge>
                    ) : null}
                    {summary.failedLines > 0 ? (
                      <Badge tone="danger">失敗 {summary.failedLines}</Badge>
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
                    ? `新增 ${summary.create}・失敗 ${summary.failedLines}（共 ${preview?.row_count ?? 0} 列）`
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
              匯入
            </Button>
          </Box>
        </>
      )}
    </MuiDialog>
  );
}
