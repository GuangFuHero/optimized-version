'use client';

import {
  Box,
  ButtonBase,
  Dialog as MuiDialog,
  IconButton,
  InputBase,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  type AdminStationReviewQuery,
  useMergeStationSuggestions,
  useStationHistory,
  useStationReview,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  TextInput,
} from '@rescue-frontend/ui';
import {
  ArrowRight,
  Check,
  CheckCheck,
  CircleCheck,
  GitPullRequestArrow,
  PencilLine,
  RefreshCw,
  TriangleAlert,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { useStationRows } from './hooks/use-station-rows';
import {
  approvesConflict,
  buildDecisions,
  buildReviewFields,
  type FieldDecision,
  hasConflict,
  pendingFieldsLabel,
  reviewValueLabel,
  type ReviewField,
  suggestionVersions,
} from './model/review';
import { EMPTY_FILTERS } from './model/station-filters';
import { formatTaiwanDateTime } from '../../../time';

const { color, radius, typography } = designTokens;

const PENDING_FILTERS = { ...EMPTY_FILTERS, pending: true };
// The timeline's largest page (backend `MAX_PAGE`); a conflict past it reads as unknown.
const HISTORY_PAGE = 200;

/** The adopted value reads as the incoming change. */
const ADOPTED = {
  ...typography.body[400],
  bgcolor: color.bg.success.subtle,
  color: color.fg.success,
};

interface ReviewQueueDialogProps {
  open: boolean;
  onClose: () => void;
  onEditStation: (uuid: string) => void;
}

export function ReviewQueueDialog({
  open,
  onClose,
  onEditStation,
}: ReviewQueueDialogProps) {
  const queue = useStationRows(PENDING_FILTERS);
  const stations = queue.rows;
  const [selected, setSelected] = useState<string | null>(null);
  const current =
    stations.find((s) => s.uuid === selected) ?? stations[0] ?? null;
  // Per station, not the page capabilities: a `team`-scoped reviewer may review a station
  // whose edit is still out of reach under other grants (WG-168).
  const canEdit = current?.canEdit ?? false;
  const { review, history, historyPage, fields, canViewHistory } =
    useQueuedStation(current);

  /** Reads the station and its history again; the history's size then, or null if it failed. */
  const resync = async () => {
    const [, fresh] = await Promise.all([review.refetch(), history.refetch()]);
    return fresh.isSuccess ? fresh.data.meta.total : null;
  };

  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: { width: 'min(1060px, 96vw)', height: 'min(82vh, 760px)', m: 0 },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          p: '18px 24px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: `${radius.md}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: color.bg.warning.subtle,
            color: color.bg.warning.default,
          }}
        >
          <GitPullRequestArrow size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ ...typography.heading[600], fontSize: 19 }}>
            前台修改建議審查
          </Typography>
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            {stations.length} 個站點有待審建議 · 核准前原資料不變動
          </Typography>
        </Box>
        <IconButton
          aria-label="關閉"
          onClick={onClose}
          sx={{ color: color.fg.neutral.muted }}
        >
          <X size={22} />
        </IconButton>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px 1fr' },
        }}
      >
        <Box
          sx={{
            overflow: 'auto',
            borderRight: `1px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.subtle,
          }}
        >
          {stations.length === 0 ? (
            <Box
              sx={{ p: 4, textAlign: 'center', color: color.fg.neutral.muted }}
            >
              {queue.isPending ? null : (
                <CheckCheck size={32} color={color.bg.success.default} />
              )}
              <Typography sx={{ ...typography.label[400], mt: '10px' }}>
                {queue.isPending ? '載入中…' : '佇列已清空'}
              </Typography>
              {queue.isPending ? null : (
                <Typography sx={{ ...typography.body[300], mt: '4px' }}>
                  目前沒有待審的修改建議。
                </Typography>
              )}
            </Box>
          ) : (
            stations.map((station) => (
              <QueueItem
                key={station.uuid}
                row={station}
                active={current?.uuid === station.uuid}
                onSelect={() => setSelected(station.uuid)}
              />
            ))
          )}
        </Box>

        {current ? (
          <StationReview
            key={current.uuid}
            uuid={current.uuid}
            name={review.data?.station?.name ?? current.name}
            loading={review.isPending}
            fields={fields}
            versions={suggestionVersions(historyPage, fields)}
            enumFields={review.data?.suggestableFields}
            historyLoading={canViewHistory && history.isPending}
            historyUnavailable={!historyPage}
            historyTotal={historyPage?.total ?? null}
            onResync={resync}
            canEdit={canEdit}
            onEditStation={onEditStation}
          />
        ) : queue.isPending ? (
          <Box />
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              p: 4,
              textAlign: 'center',
              color: color.fg.neutral.muted,
            }}
          >
            <GitPullRequestArrow size={28} />
            <Typography
              sx={{ ...typography.label[500], color: color.fg.neutral.subtle }}
            >
              沒有需要審查的修改建議
            </Typography>
            <Typography sx={{ ...typography.body[300], maxWidth: 320 }}>
              民眾在前台對站點按「建議修改」送出後，會排進這個佇列，由資料檢核員或超級管理員核准或退回。
            </Typography>
          </Box>
        )}
      </Box>
    </MuiDialog>
  );
}

type QueueRow = ReturnType<typeof useStationRows>['rows'][number];

/**
 * A queued station's suggestions, each with its conflict. The list and the detail pane both call
 * it, so every station in the queue can show 衝突 and the selected one reads the same cache.
 */
function useQueuedStation(row: QueueRow | null) {
  const uuid = row?.uuid ?? '';
  const canViewHistory = row?.raw.viewerCanViewHistory ?? false;
  const review = useStationReview({ uuid });
  // Conflicts come from the station's history; without it they are unknown, never "none".
  const history = useStationHistory(
    { path: { uuid }, query: { limit: HISTORY_PAGE } },
    { enabled: canViewHistory && Boolean(uuid) },
  );
  const historyPage = useMemo(
    () =>
      history.isSuccess && history.data
        ? { events: history.data.data, total: history.data.meta.total }
        : null,
    [history.isSuccess, history.data],
  );
  const fields = useMemo(
    () => (review.data ? buildReviewFields(review.data, historyPage) : []),
    [review.data, historyPage],
  );
  return { review, history, historyPage, fields, canViewHistory };
}

/** A station in the queue: 衝突 once a field is known to conflict, else how much waits. */
function QueueItem({
  row,
  active,
  onSelect,
}: {
  row: QueueRow;
  active: boolean;
  onSelect: () => void;
}) {
  const { fields } = useQueuedStation(row);
  const { firstSuggestedAt } = suggestionVersions(null, fields);

  return (
    <ButtonBase
      onClick={onSelect}
      sx={{
        width: '100%',
        display: 'block',
        p: '14px 18px',
        textAlign: 'left',
        borderBottom: `1px solid ${color.bg.neutral.sunken}`,
        borderLeft: `3px solid ${active ? color.bg.primary.default : 'transparent'}`,
        bgcolor: active ? color.bg.neutral.default : 'transparent',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <Typography noWrap sx={typography.label[400]}>
          {row.name}
        </Typography>
        {hasConflict(fields) ? (
          <Badge tone="danger" variant="solid" size="sm">
            衝突
          </Badge>
        ) : (
          <Badge tone="warning" size="sm">
            {pendingFieldsLabel(row.pendingFieldCount)}
          </Badge>
        )}
      </Box>
      {firstSuggestedAt ? (
        <Typography
          sx={{
            ...typography.data[300],
            color: color.fg.neutral.muted,
            mt: '5px',
          }}
        >
          最早 {formatTaiwanDateTime(firstSuggestedAt)}
        </Typography>
      ) : null}
      <Box sx={{ mt: '7px' }}>
        {/* Suggestions come from the site, so every one is crowd-sourced. */}
        <Badge tone="primary" size="sm" icon={<Users size={13} />}>
          群眾投稿
        </Badge>
      </Box>
    </ButtonBase>
  );
}

type SuggestableField = NonNullable<
  AdminStationReviewQuery['suggestableFields']
>[number];

function StationReview({
  uuid,
  name,
  loading,
  fields,
  versions,
  enumFields,
  historyLoading,
  historyUnavailable,
  historyTotal,
  onResync,
  canEdit,
  onEditStation,
}: {
  uuid: string;
  name: string;
  loading: boolean;
  fields: ReviewField[];
  versions: ReturnType<typeof suggestionVersions>;
  enumFields: readonly SuggestableField[] | undefined;
  historyLoading: boolean;
  historyUnavailable: boolean;
  historyTotal: number | null;
  onResync: () => Promise<number | null>;
  canEdit: boolean;
  onEditStation: (uuid: string) => void;
}) {
  const merge = useMergeStationSuggestions();
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [note, setNote] = useState('');
  // The history's size when the reviewer last re-compared; a later edit grows it and locks again.
  const [resyncedAt, setResyncedAt] = useState<number | null>(null);
  const [resyncing, setResyncing] = useState(false);

  const enumOptions = useMemo(
    () =>
      Object.fromEntries(
        (enumFields ?? [])
          .filter((f) => f.dataType === 'enum' && f.enumOptions)
          .map((f) => [f.fieldName, f.enumOptions ?? []]),
      ),
    [enumFields],
  );

  const payload = buildDecisions(fields, decisions);
  const approved = payload.filter((d) => d.approve).length;
  const rejected = payload.length - approved;

  const conflict = hasConflict(fields);
  const resynced = resyncedAt !== null && resyncedAt === historyTotal;
  // The prototype's 阻擋盲目覆蓋: adopting a field edited since its suggestion waits for a re-compare.
  const blocked = !resynced && approvesConflict(fields, decisions);

  const resync = async () => {
    setResyncing(true);
    try {
      const total = await onResync();
      if (total === null) toast.error('無法重新讀取版本歷史，請稍後再試');
      else setResyncedAt(total);
    } finally {
      setResyncing(false);
    }
  };

  const submit = () =>
    merge.mutate(
      {
        stationUuid: uuid,
        decisions: payload,
        reviewNote: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            `已送出審核：採用 ${approved} 欄、不採用 ${rejected} 欄`,
          );
          setDecisions({});
          setNote('');
        },
      },
    );

  if (loading) {
    return <Box sx={{ p: 3, ...typography.body[300] }}>載入中…</Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: '24px' }}>
        <ReviewHeader name={name} versions={versions} />
        {fields.length > 0 && historyUnavailable ? (
          <Box sx={{ mb: '16px' }}>
            <Callout tone="warning">
              {historyLoading
                ? '正在讀取版本歷史，衝突檢查完成前請先確認目前值。'
                : '無法讀取這個站點的版本歷史，無法檢查建議提出後欄位是否被改過。'}
            </Callout>
          </Box>
        ) : fields.some((field) => field.conflict === null) ? (
          // The newest page of history did not reach back to some suggestion.
          <Box sx={{ mb: '16px' }}>
            <Callout tone="warning">
              這個站點的版本歷史較長，部分欄位無法確認建議提出後是否被改過，請先確認目前值。
            </Callout>
          </Box>
        ) : null}
        {conflict && !resynced ? (
          <ConflictBanner>
            <Button
              variant="outline"
              size="sm"
              startIcon={<RefreshCw size={15} />}
              disabled={resyncing}
              onClick={resync}
              sx={{ mt: '10px' }}
            >
              {resyncing ? '比對中…' : '重新比對最新底稿'}
            </Button>
          </ConflictBanner>
        ) : conflict ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              p: '11px 14px',
              mb: '18px',
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.success.subtle,
            }}
          >
            <CircleCheck
              size={18}
              color={color.bg.success.default}
              style={{ flexShrink: 0 }}
            />
            <Typography
              sx={{ ...typography.body[300], color: color.fg.success }}
            >
              已重新比對：下方「目前最新值」為核准基準，建議值將覆蓋於其上。
            </Typography>
          </Box>
        ) : null}
        <Typography sx={typography.label[400]}>欄位級對比</Typography>
        <Typography
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.muted,
            mb: '10px',
          }}
        >
          投稿時的值 → 建議改為。不決定的欄位會繼續留在佇列。
        </Typography>
        {fields.length === 0 ? (
          <Callout tone="info">這個站點已沒有待審的建議。</Callout>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {fields.map((field) => (
              <ReviewFieldCard
                key={field.key}
                field={field}
                options={enumOptions[field.fieldName]}
                decision={decisions[field.key]}
                onChange={(next) =>
                  setDecisions((current) => ({ ...current, [field.key]: next }))
                }
              />
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          p: '16px 24px',
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {blocked ? (
          // Its own line: beside the note and both buttons it pushes 送出審核 onto a second row.
          <Typography
            sx={{
              ...typography.body[300],
              color: color.fg.danger,
              width: '100%',
            }}
          >
            需先重新比對才能核准
          </Typography>
        ) : null}
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="審核備註（會記在這次審核紀錄）"
            inputProps={{ 'aria-label': '審核備註' }}
          />
        </Box>
        {canEdit ? (
          <Button
            variant="outline"
            startIcon={<PencilLine size={16} />}
            onClick={() => onEditStation(uuid)}
          >
            直接調整
          </Button>
        ) : null}
        <Button
          startIcon={<Check size={18} />}
          disabled={payload.length === 0 || blocked || merge.isPending}
          onClick={submit}
        >
          送出審核（{payload.length} 欄）
        </Button>
      </Box>
    </Box>
  );
}

function ReviewFieldCard({
  field,
  options,
  decision,
  onChange,
}: {
  field: ReviewField;
  options?: string[];
  decision: FieldDecision;
  onChange: (next: FieldDecision) => void;
}) {
  const [value, setValue] = useState(field.proposedValues[0] ?? '');
  const label = (raw: string) => reviewValueLabel(field.fieldName, raw);
  const choice = decision ? (decision.approve ? 'approve' : 'reject') : 'later';

  const setChoice = (next: 'approve' | 'reject' | 'later', nextValue = value) =>
    onChange(
      next === 'later'
        ? undefined
        : { approve: next === 'approve', value: nextValue },
    );
  const setFinal = (next: string) => {
    setValue(next);
    if (choice === 'approve') setChoice('approve', next);
  };

  return (
    <Box
      sx={{
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.lg}px`,
        p: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '11px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Typography sx={typography.label[400]}>{field.label}</Typography>
        {field.conflict ? (
          <Box
            component="span"
            title="這個欄位在建議提出後已被更新，請確認目前值後再決定。"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              ...typography.label[300],
              color: color.fg.danger,
            }}
          >
            <Zap size={13} />
            同欄位衝突
          </Box>
        ) : null}
        <Typography
          sx={{
            ...typography.data[300],
            color: color.fg.neutral.muted,
            ml: 'auto',
          }}
        >
          {field.suggestionCount} 人建議 · 最早{' '}
          {formatTaiwanDateTime(field.firstSuggestedAt) ?? '—'}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
        {field.conflict === null ? (
          // Without the history there is no telling what the suggestion was made against.
          <ValueBox label="目前值" value={label(field.currentValue)} />
        ) : (
          <ValueBox
            label="投稿時的值"
            value={
              field.baseValue === null ? '（無法得知）' : label(field.baseValue)
            }
          />
        )}
        {field.conflict ? (
          <>
            <Arrow />
            <ValueBox
              label="目前最新值"
              value={label(field.currentValue)}
              conflict
            />
          </>
        ) : null}
        <Arrow />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ColumnLabel>建議改為</ColumnLabel>
          {options && options.length > 0 ? (
            <TextField
              select
              size="small"
              fullWidth
              value={value}
              onChange={(e) => setFinal(e.target.value)}
              slotProps={{
                htmlInput: { 'aria-label': `${field.label} 建議改為` },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  ...ADOPTED,
                  '& fieldset': { borderColor: color.bg.success.default },
                },
                '& .MuiSelect-select': { p: '10px 13px' },
              }}
            >
              {options.map((option) => (
                <MenuItem key={option} value={option}>
                  {label(option)}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <InputBase
              fullWidth
              value={value}
              onChange={(e) => setFinal(e.target.value)}
              inputProps={{ 'aria-label': `${field.label} 建議改為` }}
              sx={{
                ...ADOPTED,
                border: `1px solid ${color.bg.success.default}`,
                borderRadius: `${radius.md}px`,
                '& .MuiInputBase-input': { p: '10px 13px', height: 'auto' },
              }}
            />
          )}
        </Box>
      </Box>

      {field.proposedValues.length > 1 ? (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            其他建議：
          </Typography>
          {field.proposedValues.map((proposed) => (
            <ButtonBase
              key={proposed}
              onClick={() => setFinal(proposed)}
              sx={{
                ...typography.body[300],
                px: '8px',
                py: '2px',
                borderRadius: `${radius.sm}px`,
                border: `1px solid ${proposed === value ? color.bg.primary.default : color.border.default}`,
              }}
            >
              {label(proposed)}
            </ButtonBase>
          ))}
        </Box>
      ) : null}

      {field.comments.length > 0 ? (
        <Box
          component="ul"
          sx={{ m: 0, pl: '18px', color: color.fg.neutral.subtle }}
        >
          {field.comments.map((comment, i) => (
            <Box component="li" key={i} sx={typography.body[300]}>
              {comment}
            </Box>
          ))}
        </Box>
      ) : null}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={choice}
        onChange={(_, next) => next && setChoice(next)}
        aria-label={`${field.label} 的決定`}
      >
        <ToggleButton value="approve">採用</ToggleButton>
        <ToggleButton value="reject">不採用</ToggleButton>
        <ToggleButton value="later">稍後</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}

function ColumnLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        ...typography.data[300],
        color: color.fg.neutral.muted,
        mb: '5px',
      }}
    >
      {children}
    </Typography>
  );
}

function Arrow() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        pt: '22px',
        color: color.fg.neutral.muted,
      }}
    >
      <ArrowRight size={18} />
    </Box>
  );
}

/** The station, when its earliest suggestion came in, and the version then and now. */
function ReviewHeader({
  name,
  versions,
}: {
  name: string;
  versions: ReturnType<typeof suggestionVersions>;
}) {
  const { current, base, firstSuggestedAt } = versions;
  const meta = [
    firstSuggestedAt
      ? `最早提交於 ${formatTaiwanDateTime(firstSuggestedAt)}`
      : null,
    base !== null ? `投稿時根據版本 v${base}` : null,
  ].filter(Boolean);

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '18px' }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={typography.heading[600]}>{name}</Typography>
        {meta.length ? (
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            {meta.join(' · ')}
          </Typography>
        ) : null}
      </Box>
      {current !== null ? (
        <Badge tone={base === current ? 'success' : 'warning'} size="sm">
          站點現為 v{current}
        </Badge>
      ) : null}
    </Box>
  );
}

/** The prototype's 阻擋盲目覆蓋 banner: a field was edited after it was suggested. */
function ConflictBanner({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: '12px',
        p: '14px 16px',
        mb: '18px',
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.danger.subtle,
        border: `1px solid ${color.bg.danger.default}`,
      }}
    >
      <TriangleAlert
        size={20}
        color={color.bg.danger.default}
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ ...typography.label[400], color: color.fg.danger }}>
          底稿已被變更，已阻擋盲目覆蓋
        </Typography>
        <Typography
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.subtle,
            mt: '3px',
          }}
        >
          此建議投稿後，站點同一欄位已被他人更新。請重新比對最新底稿後再決定。
        </Typography>
        {children}
      </Box>
    </Box>
  );
}

function ValueBox({
  label,
  value,
  conflict = false,
}: {
  label: string;
  value: string;
  conflict?: boolean;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <ColumnLabel>{label}</ColumnLabel>
      <Box
        sx={{
          ...typography.body[400],
          p: '10px 13px',
          borderRadius: `${radius.md}px`,
          bgcolor: conflict ? color.bg.danger.subtle : color.bg.neutral.subtle,
          color: conflict ? color.fg.danger : color.fg.neutral.subtle,
          border: `1px solid ${color.border.default}`,
          wordBreak: 'break-word',
        }}
      >
        {value || '（空）'}
      </Box>
    </Box>
  );
}
