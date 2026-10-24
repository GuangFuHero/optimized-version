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
  GitPullRequestArrow,
  PencilLine,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useStationRows } from './hooks/use-station-rows';
import {
  buildDecisions,
  buildReviewFields,
  type FieldDecision,
  hasConflict,
  pendingFieldsLabel,
  type ReviewField,
} from './model/review';
import { EMPTY_FILTERS } from './model/station-filters';
import { formatAbsoluteTime } from './station-cells';

const { color, radius, typography } = designTokens;

const PENDING_FILTERS = { ...EMPTY_FILTERS, pending: true };

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
  const uuid = current?.uuid ?? '';
  // Per station, not the page capabilities: a `team`-scoped reviewer may review a station
  // whose history or edit is still out of reach under other grants (WG-168).
  const canViewHistory = current?.raw.viewerCanViewHistory ?? false;
  const canEdit = current?.canEdit ?? false;

  // Loaded here, not in the detail pane, so the list can flag the selected station's conflict.
  const review = useStationReview({ uuid });
  // Conflicts come from the station's history; without it they are unknown, never "none".
  const history = useStationHistory(
    { path: { uuid }, query: { limit: 100 } },
    { enabled: canViewHistory && Boolean(uuid) },
  );
  const historyEvents = history.isSuccess ? (history.data?.data ?? []) : null;
  const fields = useMemo(
    () => (review.data ? buildReviewFields(review.data, historyEvents) : []),
    [review.data, historyEvents],
  );
  const currentConflict = hasConflict(fields);

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
            stations.map((station) => {
              const active = current?.uuid === station.uuid;
              return (
                <ButtonBase
                  key={station.uuid}
                  onClick={() => setSelected(station.uuid)}
                  sx={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                    p: '14px 18px',
                    textAlign: 'left',
                    borderBottom: `1px solid ${color.bg.neutral.sunken}`,
                    borderLeft: `3px solid ${active ? color.bg.primary.default : 'transparent'}`,
                    bgcolor: active ? color.bg.neutral.default : 'transparent',
                  }}
                >
                  <Typography noWrap sx={typography.label[400]}>
                    {station.name}
                  </Typography>
                  {active && currentConflict ? (
                    <Badge tone="danger" variant="solid" size="sm">
                      衝突
                    </Badge>
                  ) : (
                    <Badge tone="warning" size="sm">
                      {pendingFieldsLabel(station.pendingFieldCount)}
                    </Badge>
                  )}
                </ButtonBase>
              );
            })
          )}
        </Box>

        {current ? (
          <StationReview
            key={current.uuid}
            uuid={current.uuid}
            name={review.data?.station?.name ?? current.name}
            loading={review.isPending}
            fields={fields}
            enumFields={review.data?.suggestableFields}
            historyLoading={canViewHistory && history.isPending}
            historyUnavailable={!historyEvents}
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

type SuggestableField = NonNullable<
  AdminStationReviewQuery['suggestableFields']
>[number];

function StationReview({
  uuid,
  name,
  loading,
  fields,
  enumFields,
  historyLoading,
  historyUnavailable,
  canEdit,
  onEditStation,
}: {
  uuid: string;
  name: string;
  loading: boolean;
  fields: ReviewField[];
  enumFields: readonly SuggestableField[] | undefined;
  historyLoading: boolean;
  historyUnavailable: boolean;
  canEdit: boolean;
  onEditStation: (uuid: string) => void;
}) {
  const merge = useMergeStationSuggestions();
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [note, setNote] = useState('');

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
        <Typography sx={{ ...typography.heading[600], mb: '16px' }}>
          {name}
        </Typography>
        {fields.length > 0 && historyUnavailable ? (
          <Box sx={{ mb: '16px' }}>
            <Callout tone="warning">
              {historyLoading
                ? '正在讀取版本歷史，衝突檢查完成前請先確認目前值。'
                : '無法讀取這個站點的版本歷史，無法檢查建議提出後欄位是否被改過。'}
            </Callout>
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
          目前值 → 採用的值。不決定的欄位會繼續留在佇列。
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
          disabled={payload.length === 0 || merge.isPending}
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
          {formatAbsoluteTime(field.firstSuggestedAt)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
        <ValueBox
          label="目前值"
          value={field.currentValue}
          conflict={Boolean(field.conflict)}
        />
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
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ColumnLabel>採用的值</ColumnLabel>
          {options && options.length > 0 ? (
            <TextField
              select
              size="small"
              fullWidth
              value={value}
              onChange={(e) => setFinal(e.target.value)}
              slotProps={{
                htmlInput: { 'aria-label': `${field.label} 採用的值` },
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
                  {option}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <InputBase
              fullWidth
              value={value}
              onChange={(e) => setFinal(e.target.value)}
              inputProps={{ 'aria-label': `${field.label} 採用的值` }}
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
              {proposed}
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

function ValueBox({
  label,
  value,
  conflict,
}: {
  label: string;
  value: string;
  conflict: boolean;
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
