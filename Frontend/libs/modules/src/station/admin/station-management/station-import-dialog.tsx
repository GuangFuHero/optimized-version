'use client';

import {
  Box,
  ButtonBase,
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
import {
  CircleCheck,
  CircleX,
  Download,
  FolderOpen,
  Upload,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import {
  getStationTypeIcon,
  getStationTypeLabel,
  STATION_TYPE_OPTIONS,
} from '../../type-options';
import {
  downloadBase64,
  downloadBlob,
  errorsOutsideSample,
  importSummary,
  mergeMapping,
  type PreviewRow,
  previewRows,
  STATION_IMPORT_FIELDS,
  stationImportTemplate,
} from './model/import';

const { color, focusRing, motion, radius, typography } = designTokens;

type Preview = components['schemas']['BulkPreviewResponse'];
type Result = components['schemas']['BulkImportResponse'];

const SKIP = '__skip__';

function downloadTemplate(stationType: string) {
  const label =
    STATION_TYPE_OPTIONS.find((o) => o.value === stationType)?.label ??
    stationType;
  // The BOM lets Excel open the CJK text as UTF-8, as the backend's own CSVs do.
  downloadBlob(
    new Blob(['\uFEFF', stationImportTemplate(stationType)], {
      type: 'text/csv;charset=utf-8',
    }),
    `資源站點匯入範本_${label}.csv`,
  );
}

export function StationImportDialog({ onClose }: { onClose: () => void }) {
  const [stationType, setStationType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pasteTimer = useRef<number | undefined>(undefined);
  const previewImport = usePreviewStationImport();
  const commitImport = useCommitStationImport();
  const busy = previewImport.isPending || commitImport.isPending;

  useEffect(() => {
    return () => window.clearTimeout(pasteTimer.current);
  }, []);

  const mapping = preview
    ? mergeMapping(preview.suggested_mapping, overrides)
    : undefined;

  const runPreview = (nextFile: File, type: string, nextMapping?: string) =>
    previewImport.mutate(
      {
        params: { query: { station_type: type } },
        // The generated type says string; the serializer appends the File as-is.
        body: { file: nextFile as unknown as string, mapping: nextMapping },
      },
      { onSuccess: (data) => setPreview(data) },
    );

  const startPreview = (nextFile: File, type: string) => {
    setFile(nextFile);
    setOverrides({});
    setPreview(null);
    runPreview(nextFile, type);
  };

  const chooseFile = (nextFile: File | undefined) => {
    if (!nextFile || !stationType) return;
    window.clearTimeout(pasteTimer.current);
    setPasted('');
    startPreview(nextFile, stationType);
  };

  // Pasted text goes through the same upload endpoint: the backend only accepts files.
  const previewPasted = (text: string) => {
    window.clearTimeout(pasteTimer.current);
    pasteTimer.current = undefined;
    if (!stationType || !text.trim()) return;
    startPreview(
      new File([text], 'pasted.csv', { type: 'text/csv' }),
      stationType,
    );
  };

  const changePasted = (text: string) => {
    setPasted(text);
    setFile(null);
    setPreview(null);
    setOverrides({});
    window.clearTimeout(pasteTimer.current);
    pasteTimer.current = window.setTimeout(() => previewPasted(text), 800);
  };

  const chooseType = (type: string) => {
    window.clearTimeout(pasteTimer.current);
    setStationType(type);
    setFile(null);
    setPasted('');
    setPreview(null);
    setOverrides({});
  };

  const changeMapping = (header: string, field: string) => {
    if (!file || !stationType || !preview) return;
    const next = { ...overrides, [header]: field === SKIP ? null : field };
    setOverrides(next);
    runPreview(
      file,
      stationType,
      mergeMapping(preview.suggested_mapping, next),
    );
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
  const mapped = preview
    ? (JSON.parse(mergeMapping(preview.suggested_mapping, overrides)) as Record<
        string,
        string
      >)
    : {};
  const rows = preview ? previewRows(preview, mapped) : [];
  const laterErrors = preview ? errorsOutsideSample(preview) : [];
  const importable = summary ? summary.create + summary.update : 0;
  const typeLabel = stationType ? getStationTypeLabel(stationType) : '';

  return (
    <MuiDialog
      open
      onClose={onClose}
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
              title="1 · 這份檔案是哪一種站點"
              caption="一個檔案只放一種站點；一列是一個站點。"
            >
              <Box
                role="radiogroup"
                aria-label="站點類型"
                sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
              >
                {STATION_TYPE_OPTIONS.map((option) => (
                  <TypeChip
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    active={stationType === option.value}
                    onSelect={() => chooseType(option.value)}
                  />
                ))}
              </Box>
            </Step>

            {stationType ? (
              <Step
                title="2 · 上傳檔案"
                trailing={
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      startIcon={<Download size={15} />}
                      onClick={() => downloadTemplate(stationType)}
                    >
                      下載「{typeLabel}」範本
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      startIcon={<FolderOpen size={15} />}
                      onClick={() => fileInput.current?.click()}
                      disabled={busy}
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
                {file && !pasted ? <Muted>已選擇：{file.name}</Muted> : null}
                <Box
                  component="textarea"
                  aria-label="貼上 CSV 內容"
                  placeholder="也可以直接貼上 CSV 內容（第一列是欄位名稱）"
                  value={pasted}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    changePasted(e.target.value)
                  }
                  onBlur={() => {
                    if (pasteTimer.current !== undefined) previewPasted(pasted);
                  }}
                  sx={{
                    ...typography.body[300],
                    minHeight: 80,
                    width: '100%',
                    boxSizing: 'border-box',
                    p: '10px 12px',
                    resize: 'vertical',
                    color: color.fg.neutral.default,
                    bgcolor: color.bg.neutral.subtle,
                    border: `1px solid ${color.border.default}`,
                    borderRadius: `${radius.md}px`,
                    outline: 'none',
                    '&::placeholder': { color: color.fg.neutral.muted },
                    '&:focus-visible': {
                      outline: `${focusRing.width}px solid ${focusRing.color}`,
                      outlineOffset: `${focusRing.offset}px`,
                    },
                  }}
                />
                <Muted>
                  從「匯出」下載的檔案就是範本。新的站點必填：站點名稱、緯度、經度。檔案裡沒有聯絡人、電話、營運狀態，建立後再補。每一列的
                  source 填 official，站點才會標示為官方。
                </Muted>
              </Step>
            ) : null}

            {preview ? (
              <Step title="3 · 欄位對應" caption="檔案的每一欄要寫進哪個欄位">
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px 16px',
                  }}
                >
                  {preview.detected_headers.map((header) => {
                    const unmapped = !mapped[header];
                    return (
                      <Box key={header} sx={{ display: 'contents' }}>
                        <Typography
                          sx={{
                            ...typography.body[300],
                            alignSelf: 'center',
                            color: unmapped
                              ? color.fg.neutral.muted
                              : color.fg.neutral.default,
                          }}
                        >
                          {header}
                        </Typography>
                        <TextField
                          select
                          size="small"
                          value={mapped[header] ?? SKIP}
                          onChange={(e) =>
                            changeMapping(header, e.target.value)
                          }
                          disabled={busy}
                        >
                          <MenuItem value={SKIP}>（不匯入）</MenuItem>
                          {STATION_IMPORT_FIELDS.map((field) => (
                            <MenuItem key={field.value} value={field.value}>
                              {field.label}
                              {field.required ? <RequiredMark /> : null}
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
              <Step
                title="4 · 預覽與檢查"
                caption={`還沒寫入。可匯入 ${importable} 列${
                  summary.failedLines > 0
                    ? `，無法匯入 ${summary.failedLines} 列`
                    : ''
                }。`}
              >
                {summary.update > 0 ? (
                  <Muted>
                    其中 {summary.update}{' '}
                    列會更新既有站點：站名＋縣市＋鄉鎮對到既有的站點；只會改說明、開放時間、level、comment、公開範圍和位置（經緯度），空白的格子不動。站名與地址建立後不能用匯入改。
                  </Muted>
                ) : null}
                {rows.length > 0 ? <PreviewList rows={rows} /> : null}
                {preview.row_count > rows.length ? (
                  <Muted>
                    只列出前 {rows.length} 列（共 {preview.row_count} 列）。
                  </Muted>
                ) : null}
                {laterErrors.length > 0 ? (
                  <ErrorList errors={laterErrors} />
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
              {busy
                ? '試算中…'
                : summary
                  ? `可匯入 ${importable} 列・略過 ${summary.failedLines} 列`
                  : ''}
            </Muted>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button
              onClick={commit}
              startIcon={<Upload size={17} />}
              disabled={!summary?.canCommit || busy}
            >
              {summary?.canCommit ? `確認匯入 ${importable} 列` : '確認匯入'}
            </Button>
          </Box>
        </>
      )}
    </MuiDialog>
  );
}

function TypeChip({
  value,
  label,
  active,
  onSelect,
}: {
  value: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = getStationTypeIcon(value);
  return (
    <ButtonBase
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      disableRipple
      sx={{
        ...typography.label[400],
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: 34,
        px: '12px',
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
      }}
    >
      <Icon sx={{ fontSize: 16 }} aria-hidden />
      {label}
    </ButtonBase>
  );
}

function PreviewList({ rows }: { rows: readonly PreviewRow[] }) {
  return (
    <Box
      sx={{
        maxHeight: 260,
        overflowY: 'auto',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.md}px`,
      }}
    >
      {rows.map((row) => {
        const bad = row.errors.length > 0;
        return (
          <Box
            key={row.line}
            sx={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr',
              gap: '10px',
              p: '9px 12px',
              borderBottom: `1px solid ${color.border.subtle}`,
              opacity: bad ? 0.75 : 1,
            }}
          >
            <Typography
              sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
            >
              #{row.line}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                {bad ? (
                  <CircleX
                    size={14}
                    color={color.fg.danger}
                    aria-label="無法匯入"
                  />
                ) : (
                  <CircleCheck
                    size={14}
                    color={color.fg.success}
                    aria-label="可匯入"
                  />
                )}
                <Typography sx={typography.label[300]}>
                  {row.name || '（無名稱）'}
                </Typography>
                {row.type ? (
                  <Typography
                    sx={{
                      ...typography.data[300],
                      color: color.fg.neutral.muted,
                    }}
                  >
                    {getStationTypeLabel(row.type)}
                  </Typography>
                ) : null}
              </Box>
              <Muted>{row.address || '（無地址）'}</Muted>
              {row.errors.map((message, i) => (
                <Typography
                  key={i}
                  sx={{ ...typography.data[300], color: color.fg.danger }}
                >
                  · {message}
                </Typography>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function RequiredMark() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ color: color.fg.danger, ml: '2px' }}
    >
      *
    </Box>
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
          <Badge tone="success">新增 {result.created} 列</Badge>
          <Badge tone="info">更新 {result.updated} 列</Badge>
          <Badge tone={result.failed ? 'danger' : 'neutral'}>
            失敗 {result.failed} 列
          </Badge>
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
  trailing,
  children,
}: {
  title: string;
  caption?: string;
  /** Actions or badges at the end of the title row. */
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
        <Typography sx={{ ...typography.label[400], flex: 1 }}>
          {title}
        </Typography>
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
