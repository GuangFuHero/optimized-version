'use client';

import {
  Box,
  Dialog as MuiDialog,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import {
  useCommitStationImport,
  usePreviewStationImport,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';
import { CircleCheck, Download, FolderOpen, Upload, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ErrorList,
  ImportResult,
  Step,
  TypeChip,
} from '../../../admin/shared/import-dialog-parts';
import { Muted } from '../../../admin/shared/muted';
import { getStationTypeIcon } from '../../station-type-icon';
import { getStationTypeLabel, STATION_TYPE_OPTIONS } from '../../type-options';
import {
  downloadBlob,
  importSummary,
} from '../../../admin/shared/model/bulk-import';
import {
  ImportSuspectsBulkActions,
  ImportSuspectsStep,
} from './import-suspects-step';
import {
  importFieldLabel,
  mergeMapping,
  STATION_IMPORT_FIELDS,
  stationImportTemplate,
} from './model/import';
import {
  decisionsField,
  declinedField,
  describeSuspect,
  type FiledRows,
  heldThoughFiled,
  keepFiled,
} from './model/import-suspects';

const { color, focusRing, radius, typography } = designTokens;

type Preview = components['schemas']['BulkPreviewResponse'];
type Result = components['schemas']['BulkImportResponse'];
type Suspect = components['schemas']['SuspectedRowResponse'];

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
  const [filed, setFiled] = useState<FiledRows>({});
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pasteTimer = useRef<number | undefined>(undefined);
  const previewImport = usePreviewStationImport();
  const commitImport = useCommitStationImport();
  const busy = previewImport.isPending || commitImport.isPending;
  // Closing mid-import would unmount the dialog: the import still happens, but its report is lost.
  const committing = commitImport.isPending;

  useEffect(() => {
    return () => window.clearTimeout(pasteTimer.current);
  }, []);

  const runPreview = (nextFile: File, type: string, nextMapping?: string) =>
    previewImport.mutate(
      {
        params: { query: { station_type: type } },
        // The generated type says string; the serializer appends the File as-is.
        body: { file: nextFile as unknown as string, mapping: nextMapping },
      },
      {
        onSuccess: (data) => {
          setPreview(data);
          // A new mapping can change which rows look like what; a choice outlives it only when its
          // row still looks like the same station (ADR-400).
          setFiled((current) => keepFiled(current, data.suspects ?? []));
        },
      },
    );

  const startPreview = (nextFile: File, type: string) => {
    setFile(nextFile);
    setOverrides({});
    setFiled({});
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
    // Drop a preview still in flight, so the result for text that is gone never lands.
    previewImport.reset();
    setPasted(text);
    setFile(null);
    setPreview(null);
    setOverrides({});
    setFiled({});
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
    setFiled({});
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

  // The same file and mapping again: the engine may answer this time.
  const rerunPreview = () => {
    if (!file || !stationType || !preview) return;
    runPreview(
      file,
      stationType,
      mergeMapping(preview.suggested_mapping, overrides),
    );
  };

  // The backend marks every imported station official, so the file goes as it is.
  const commit = () => {
    if (!file || !stationType) return;
    commitImport.mutate(
      {
        params: { query: { station_type: stationType } },
        body: {
          file: file as unknown as string,
          mapping: JSON.stringify(mapped),
          decisions: decisionsField(filed),
          // Named, so they stay uncreated even if the check gives no answer at commit (ADR-398).
          declined: declinedField(preview?.suspects ?? [], filed),
        },
      },
      {
        onSuccess: (data) => {
          setResult(data);
          toast.success(
            `已匯入：新增 ${data.created}、更新 ${data.updated}${
              data.declined > 0 ? `，${data.declined} 列選了不建立` : ''
            }${data.suspected > 0 ? `，${data.suspected} 列疑似重複未建立` : ''}`,
          );
        },
      },
    );
  };

  const suspects = preview?.suspects ?? [];
  const summary = preview
    ? importSummary(preview, Object.keys(filed).length)
    : null;
  const mapped = preview
    ? (JSON.parse(mergeMapping(preview.suggested_mapping, overrides)) as Record<
        string,
        string
      >)
    : {};
  const typeLabel = stationType ? getStationTypeLabel(stationType) : '';

  return (
    <MuiDialog
      open
      onClose={committing ? undefined : onClose}
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
        <IconButton aria-label="關閉" onClick={onClose} disabled={committing}>
          <X size={20} />
        </IconButton>
      </Box>

      {result ? (
        <ImportResult
          result={result}
          onClose={onClose}
          createdUnit="列"
          showUpdated
          note="新增的站點請到現場確認營運狀態，並補上聯絡人與電話。"
          partialNote="站點已寫入，但它的部分欄位沒有寫入（多半是缺少填寫站點欄位的權限）。請打開這些站點核對欄位，再補齊或請有權限的人補上。"
          fieldLabel={importFieldLabel}
          badges={<SuspectBadges result={result} />}
          reportLabel="下載沒匯入的列"
        >
          <SuspectNotes result={result} filed={filed} />
        </ImportResult>
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
                {STATION_TYPE_OPTIONS.map((option) => {
                  const Icon = getStationTypeIcon(option.value);
                  return (
                    <TypeChip
                      key={option.value}
                      icon={<Icon sx={{ fontSize: 16 }} aria-hidden />}
                      label={option.label}
                      active={stationType === option.value}
                      // A preview still running would land after the switch cleared its file.
                      disabled={busy}
                      onSelect={() => chooseType(option.value)}
                    />
                  );
                })}
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
                <Box
                  component="textarea"
                  aria-label="貼上 CSV 內容"
                  placeholder="也可以直接貼上 CSV 內容（第一列是欄位名稱）"
                  value={pasted}
                  // Typing clears the preview and the choices the commit in flight reports against.
                  disabled={committing}
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
                <Muted>
                  從「匯出」下載的檔案就是範本。新的站點必填：站點名稱、緯度、經度。檔案裡沒有聯絡人、電話、營運狀態，建立後再補。
                </Muted>
              </Step>
            ) : null}

            {preview ? (
              <Step
                title="3 · 欄位對應"
                aside={<Muted>檔案的每一欄要寫進哪個欄位</Muted>}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'minmax(0, 96px) minmax(0, 1fr)',
                      sm: 'repeat(3, minmax(0, 96px) minmax(0, 1fr))',
                    },
                    gap: '10px 12px',
                    alignItems: 'center',
                  }}
                >
                  {preview.detected_headers.map((header) => (
                    <Box key={header} sx={{ display: 'contents' }}>
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: mapped[header]
                            ? color.fg.neutral.default
                            : color.fg.neutral.muted,
                          overflowWrap: 'anywhere',
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
                        slotProps={{
                          select: { native: true },
                          htmlInput: { 'aria-label': `${header} 對應的欄位` },
                        }}
                      >
                        <option value={SKIP}>（不匯入）</option>
                        {STATION_IMPORT_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>
                            {field.required ? `${field.label} *` : field.label}
                          </option>
                        ))}
                      </TextField>
                    </Box>
                  ))}
                </Box>
              </Step>
            ) : null}

            {preview && summary ? (
              <Step
                title="4 · 試算結果"
                aside={
                  <>
                    <Muted>還沒寫入</Muted>
                    <Badge tone="success">新增 {summary.create}</Badge>
                    <Badge tone="info">更新 {summary.update}</Badge>
                    {summary.suspected > 0 ? (
                      <Badge tone="warning">疑似重複 {summary.suspected}</Badge>
                    ) : null}
                    {summary.failedLines > 0 ? (
                      <Badge tone="danger">失敗 {summary.failedLines}</Badge>
                    ) : null}
                  </>
                }
              >
                {preview.dedup_checked === false ? (
                  <Callout tone="warning">
                    這次沒有比對重複：比對服務沒有回應。新增的列可能跟現有的站點重複。
                    <Box sx={{ mt: '8px' }}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={rerunPreview}
                      >
                        重新試算
                      </Button>
                    </Box>
                  </Callout>
                ) : null}
                {summary.update > 0 ? (
                  <Muted>
                    「更新」是站名＋縣市＋鄉鎮對到既有的站點；只會改說明、開放時間、level、comment、公開範圍和位置（經緯度），空白的格子不動。站名與地址建立後不能用匯入改。
                  </Muted>
                ) : null}
                {preview.errors.length > 0 ? (
                  <ErrorList
                    errors={preview.errors}
                    fieldLabel={importFieldLabel}
                  />
                ) : null}
              </Step>
            ) : null}

            {suspects.length > 0 ? (
              <Step
                title="5 · 疑似重複"
                aside={<Muted>沒選「仍要建立」的列不會建立</Muted>}
                trailing={
                  <ImportSuspectsBulkActions
                    suspects={suspects}
                    disabled={busy}
                    onChange={setFiled}
                  />
                }
              >
                <ImportSuspectsStep
                  suspects={suspects}
                  filed={filed}
                  disabled={busy}
                  onChange={setFiled}
                />
              </Step>
            ) : null}
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '10px',
              p: '14px 22px',
              borderTop: `1px solid ${color.border.default}`,
            }}
          >
            {/* Up to five counts: on a narrow screen they take a line of their own above the buttons. */}
            <Muted sx={{ flex: '1 1 240px' }}>
              {/* Comparing a crowded file can add about 20 s each way (uiux 2026-10-27, Q16). */}
              {committing
                ? '匯入、比對中…'
                : busy
                  ? '試算、比對中…'
                  : summary
                    ? [
                        `新增 ${summary.create}`,
                        `更新 ${summary.update}`,
                        ...(summary.suspected > 0
                          ? [
                              `疑似重複 ${summary.suspected}（仍要建立 ${summary.filed}）`,
                            ]
                          : []),
                        `失敗 ${summary.failedLines}`,
                      ].join('・') + `（共 ${preview?.row_count ?? 0} 列）`
                    : ''}
            </Muted>
            <Button variant="ghost" onClick={onClose} disabled={committing}>
              取消
            </Button>
            <Button
              onClick={commit}
              startIcon={<Upload size={17} />}
              disabled={!summary?.canCommit || busy}
            >
              {summary?.canCommit
                ? `確認匯入 ${summary.importable} 列`
                : '確認匯入'}
            </Button>
          </Box>
        </>
      )}
    </MuiDialog>
  );
}

/** The counts a duplicate check adds to the result's row: rows declined, and rows held (ADR-398). */
function SuspectBadges({ result }: { result: Result }) {
  return (
    <>
      {result.declined > 0 ? (
        <Badge tone="neutral">選了不建立 {result.declined} 列</Badge>
      ) : null}
      {result.suspected > 0 ? (
        <Badge tone="warning">疑似重複未建立 {result.suspected} 列</Badge>
      ) : null}
    </>
  );
}

/** What the duplicate check left: rows declined or held, and each held row with what it looks like. */
function SuspectNotes({
  result,
  filed,
}: {
  result: Result;
  /** What the importer chose to file anyway, to tell apart the rows the commit held all the same. */
  filed: FiledRows;
}) {
  const held = result.suspects ?? [];
  const changed = heldThoughFiled(filed, held);
  return (
    <>
      {result.declined > 0 ? (
        <Muted>
          選了不建立的 {result.declined} 列沒有建立，也放進了報告檔。
        </Muted>
      ) : null}
      {result.dedup_checked === false ? (
        <Callout tone="warning">
          這次沒有比對重複，新增的站點可能跟現有的重複。
        </Callout>
      ) : null}
      {result.suspected > 0 ? (
        <Callout tone="warning">
          {result.suspected}{' '}
          列疑似重複，沒有建立，已放進報告檔。確認不是重複的話，重新上傳報告檔，再選「仍要建立」。
        </Callout>
      ) : null}
      {held.length > 0 ? <HeldList held={held} changed={changed} /> : null}
    </>
  );
}

/** The suspected rows the commit held, each with the station it looks like now. */
function HeldList({
  held,
  changed,
}: {
  held: readonly Suspect[];
  /** Lines filed anyway that looked like another station by the commit (ADR-400). */
  changed: ReadonlySet<number>;
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
      {held.map((suspect) => {
        const described = describeSuspect(suspect);
        const looksLike = [described.title, described.distance]
          .filter(Boolean)
          .join('，');
        return (
          <Box
            key={suspect.line}
            sx={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr',
              gap: '8px',
              p: '6px 12px',
              borderBottom: `1px solid ${color.border.subtle}`,
              ...typography.body[300],
            }}
          >
            <span>第 {suspect.line} 列</span>
            <Box component="span" sx={{ minWidth: 0 }}>
              {described.row ? (
                <Box
                  component="span"
                  sx={{ display: 'block', color: color.fg.neutral.default }}
                >
                  {described.row}
                </Box>
              ) : null}
              <Box
                component="span"
                sx={{ display: 'block', color: color.fg.neutral.muted }}
              >
                {changed.has(suspect.line)
                  ? `選了仍要建立，但比對結果跟試算時不同，沒有建立。現在最像的是：${looksLike}`
                  : `很像：${looksLike}`}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
