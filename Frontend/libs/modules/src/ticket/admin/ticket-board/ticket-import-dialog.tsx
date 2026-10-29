'use client';

import {
  Box,
  ButtonBase,
  Dialog as MuiDialog,
  IconButton,
  Typography,
} from '@mui/material';
import {
  useCommitTicketImport,
  usePreviewTicketImport,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';
import { CircleCheck, FolderOpen, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
  downloadBase64,
  importSummary,
} from '../../../admin/shared/model/bulk-import';
import { formatTicketTypeLabel } from '../../status';
import { TICKET_EXPORT_TYPES } from './model/ticket-export';

const { color, focusRing, motion, radius, typography } = designTokens;

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
        <ImportResult result={result} onClose={onClose} />
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

function TypeChip({
  label,
  active,
  disabled,
  onSelect,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      disabled={disabled}
      disableRipple
      sx={{
        ...typography.label[400],
        display: 'inline-flex',
        alignItems: 'center',
        height: 34,
        px: '14px',
        borderRadius: `${radius.full}px`,
        border: `1px solid ${
          active ? color.brand.primary.default : color.border.default
        }`,
        bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.default,
        color: color.fg.neutral.default,
        transition: `background-color ${motion.transition.fast}`,
        '&:hover': {
          bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.subtle,
        },
        '&.Mui-focusVisible': {
          outline: `${focusRing.width}px solid ${focusRing.color}`,
          outlineOffset: `${focusRing.offset}px`,
        },
        '&.Mui-disabled': { color: color.fg.disable },
      }}
    >
      {label}
    </ButtonBase>
  );
}

function ImportResult({
  result,
  onClose,
}: {
  result: Result;
  onClose: () => void;
}) {
  return (
    <>
      <Box
        sx={{
          p: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <Badge tone="success">新增 {result.created} 張</Badge>
          <Badge tone={result.failed ? 'danger' : 'neutral'}>
            失敗 {result.failed} 列
          </Badge>
          <Badge tone="neutral">批次 {result.batch_id}</Badge>
        </Box>
        {result.failed > 0 ? (
          <Callout tone="warning">
            失敗的列沒有寫入。修正後再匯入一次即可 —— 已成功的列不會重複建立。
          </Callout>
        ) : null}
        {result.errors.length > 0 ? <ErrorList errors={result.errors} /> : null}
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          p: '14px 22px',
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {result.error_report ? (
          <Button
            variant="outline"
            onClick={() =>
              result.error_report && downloadBase64(result.error_report)
            }
          >
            下載失敗的列
          </Button>
        ) : null}
        <Button onClick={onClose}>關閉</Button>
      </Box>
    </>
  );
}

function ErrorList({
  errors,
}: {
  errors: readonly components['schemas']['RowErrorResponse'][];
}) {
  return (
    <Box
      sx={{
        maxHeight: 220,
        overflow: 'auto',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.md}px`,
      }}
    >
      {errors.map((error, i) => (
        <Box
          key={`${error.line}-${error.column}-${i}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: '80px 120px 1fr',
            gap: '8px',
            p: '6px 12px',
            borderBottom: `1px solid ${color.border.subtle}`,
            ...typography.body[300],
          }}
        >
          <span>第 {error.line} 列</span>
          <span>{error.column || '整列'}</span>
          <Box component="span" sx={{ color: color.fg.danger }}>
            {error.message}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Step({
  title,
  caption,
  aside,
  trailing,
  children,
}: {
  title: string;
  caption?: string;
  aside?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px 10px',
        }}
      >
        <Typography sx={typography.label[400]}>{title}</Typography>
        {aside}
        <Box sx={{ flex: 1 }} />
        {trailing ? (
          <Box sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px' }}>
            {trailing}
          </Box>
        ) : null}
      </Box>
      {caption ? <Muted>{caption}</Muted> : null}
      {children}
    </Box>
  );
}

function Muted({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Typography
      sx={{ ...typography.body[300], color: color.fg.neutral.muted, ...sx }}
    >
      {children}
    </Typography>
  );
}
