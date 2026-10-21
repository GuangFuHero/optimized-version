'use client';

import {
  Box,
  Chip,
  Dialog as MuiDialog,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  useCommitStationImport,
  usePreviewStationImport,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';
import { CircleCheck, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { STATION_TYPE_OPTIONS } from '../../type-options';
import {
  downloadBase64,
  importSummary,
  mergeMapping,
  STATION_IMPORT_FIELDS,
} from './model/import';

const { color, radius, typography } = designTokens;

type Preview = components['schemas']['BulkPreviewResponse'];
type Result = components['schemas']['BulkImportResponse'];

const SKIP = '__skip__';

export function StationImportDialog({ onClose }: { onClose: () => void }) {
  const [stationType, setStationType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewImport = usePreviewStationImport();
  const commitImport = useCommitStationImport();
  const busy = previewImport.isPending || commitImport.isPending;

  const mapping = preview ? mergeMapping(preview.suggested_mapping, overrides) : undefined;

  const runPreview = (nextFile: File, type: string, nextMapping?: string) =>
    previewImport.mutate(
      {
        params: { query: { station_type: type } },
        // The generated type says string; the serializer appends the File as-is.
        body: { file: nextFile as unknown as string, mapping: nextMapping },
      },
      { onSuccess: (data) => setPreview(data) },
    );

  const chooseFile = (nextFile: File | undefined) => {
    if (!nextFile || !stationType) return;
    setFile(nextFile);
    setOverrides({});
    setPreview(null);
    runPreview(nextFile, stationType);
  };

  const changeMapping = (header: string, field: string) => {
    if (!file || !stationType || !preview) return;
    const next = { ...overrides, [header]: field === SKIP ? null : field };
    setOverrides(next);
    runPreview(file, stationType, mergeMapping(preview.suggested_mapping, next));
  };

  const commit = () => {
    if (!file || !stationType) return;
    commitImport.mutate(
      {
        params: { query: { station_type: stationType } },
        body: { file: file as unknown as string, mapping },
      },
      {
        onSuccess: (data) => {
          setResult(data);
          toast.success(`已匯入：新增 ${data.created}、更新 ${data.updated}`);
        },
      },
    );
  };

  const summary = preview ? importSummary(preview) : null;
  const mapped = preview ? (JSON.parse(mergeMapping(preview.suggested_mapping, overrides)) as Record<string, string>) : {};

  return (
    <MuiDialog open onClose={onClose} maxWidth="md" fullWidth>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          p: '16px 22px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        {result ? <CircleCheck size={20} /> : <Upload size={20} />}
        <Typography sx={{ ...typography.heading[600], flex: 1 }}>
          {result ? '匯入完成' : '匯入資源站點'}
        </Typography>
        <IconButton aria-label="關閉" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </Box>

      {result ? (
        <ImportResult result={result} onClose={onClose} />
      ) : (
        <>
          <Box sx={{ p: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px', overflow: 'auto' }}>
            <Step title="1 · 這份檔案是哪一種站點" caption="一個檔案只放一種站點；一列是一個站點。">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {STATION_TYPE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    clickable
                    color={stationType === option.value ? 'primary' : 'default'}
                    variant={stationType === option.value ? 'filled' : 'outlined'}
                    onClick={() => {
                      setStationType(option.value);
                      setFile(null);
                      setPreview(null);
                      setOverrides({});
                    }}
                  />
                ))}
              </Box>
            </Step>

            {stationType ? (
              <Step title="2 · 上傳檔案">
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    startIcon={<Upload size={16} />}
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                  >
                    選擇 CSV／Excel
                  </Button>
                  {file ? <Muted>已讀取：{file.name}</Muted> : null}
                </Box>
                <Muted>
                  從「匯出」下載的檔案就是範本。新的站點必填：站點名稱、緯度、經度。檔案裡沒有聯絡人、電話、營運狀態，建立後再補。匯入的站點來源依檔案的 source 欄；要標示官方，請在檔案填 official。
                </Muted>
              </Step>
            ) : null}

            {preview ? (
              <Step title="3 · 欄位對應" caption="檔案的每一欄要寫進哪個欄位">
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {preview.detected_headers.map((header) => {
                    const unmapped = !mapped[header];
                    return (
                      <Box key={header} sx={{ display: 'contents' }}>
                        <Typography
                          sx={{
                            ...typography.body[300],
                            alignSelf: 'center',
                            color: unmapped ? color.fg.warning : color.fg.neutral.default,
                          }}
                        >
                          {header}
                        </Typography>
                        <TextField
                          select
                          size="small"
                          value={mapped[header] ?? SKIP}
                          onChange={(e) => changeMapping(header, e.target.value)}
                          disabled={busy}
                        >
                          <MenuItem value={SKIP}>（不匯入）</MenuItem>
                          {STATION_IMPORT_FIELDS.map((field) => (
                            <MenuItem key={field.value} value={field.value}>
                              {field.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>
                    );
                  })}
                </Box>
              </Step>
            ) : null}

            {preview && summary ? (
              <Step title="4 · 試算結果">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <Badge tone="neutral">還沒寫入</Badge>
                  <Badge tone="success">新增 {summary.create}</Badge>
                  <Badge tone="info">更新 {summary.update}</Badge>
                  <Badge tone={summary.failedLines ? 'danger' : 'neutral'}>失敗 {summary.failedLines}</Badge>
                </Box>
                {summary.update > 0 ? (
                  <Muted>
                    「更新」是站名＋縣市＋鄉鎮對到既有的站點；只會改說明、開放時間、level、comment、公開範圍和位置（經緯度），空白的格子不動。站名與地址建立後不能用匯入改。
                  </Muted>
                ) : null}
                {preview.errors.length > 0 ? <ErrorList errors={preview.errors} /> : null}
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
              {summary
                ? `新增 ${summary.create}・更新 ${summary.update}・失敗 ${summary.failedLines}（共 ${preview?.row_count ?? 0} 列）`
                : busy
                  ? '試算中…'
                  : ''}
            </Muted>
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" onClick={commit} disabled={!summary?.canCommit || busy}>
              {summary?.canCommit
                ? `確認匯入 ${summary.create + summary.update} 列`
                : '確認匯入'}
            </Button>
          </Box>
        </>
      )}
    </MuiDialog>
  );
}

function ImportResult({ result, onClose }: { result: Result; onClose: () => void }) {
  return (
    <>
      <Box sx={{ p: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <Badge tone="success">新增 {result.created} 列</Badge>
          <Badge tone="info">更新 {result.updated} 列</Badge>
          <Badge tone={result.failed ? 'danger' : 'neutral'}>失敗 {result.failed} 列</Badge>
          <Badge tone="neutral">批次 {result.batch_id}</Badge>
        </Box>
        {result.created > 0 ? (
          <Muted>新增的站點請到現場確認營運狀態，並補上聯絡人與電話。</Muted>
        ) : null}
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
            size="sm"
            onClick={() => result.error_report && downloadBase64(result.error_report)}
          >
            下載失敗的列
          </Button>
        ) : null}
        <Button size="sm" onClick={onClose}>
          關閉
        </Button>
      </Box>
    </>
  );
}

function ErrorList({ errors }: { errors: readonly components['schemas']['RowErrorResponse'][] }) {
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

function Step({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Typography sx={typography.label[500]}>{title}</Typography>
      {caption ? <Muted>{caption}</Muted> : null}
      {children}
    </Box>
  );
}

function Muted({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted, ...sx }}>
      {children}
    </Typography>
  );
}
