'use client';

import {
  Box,
  ButtonBase,
  Dialog as MuiDialog,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
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
import { CheckCheck, GitPullRequestArrow, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useStationRows } from './hooks/use-station-rows';
import {
  buildDecisions,
  buildReviewFields,
  type FieldDecision,
  pendingFieldsLabel,
  type ReviewField,
} from './model/review';
import { EMPTY_FILTERS } from './model/station-filters';
import { formatAbsoluteTime } from './station-cells';

const { color, radius, typography } = designTokens;

const PENDING_FILTERS = { ...EMPTY_FILTERS, pending: true };

interface ReviewQueueDialogProps {
  open: boolean;
  canEdit: boolean;
  canViewHistory: boolean;
  onClose: () => void;
  onEditStation: (uuid: string) => void;
}

export function ReviewQueueDialog({
  open,
  canEdit,
  canViewHistory,
  onClose,
  onEditStation,
}: ReviewQueueDialogProps) {
  const queue = useStationRows(PENDING_FILTERS);
  const stations = queue.rows;
  const [selected, setSelected] = useState<string | null>(null);
  const current =
    stations.find((s) => s.uuid === selected) ?? stations[0] ?? null;

  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{ paper: { sx: { height: 'min(82vh, 760px)' } } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          p: '16px 24px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <GitPullRequestArrow size={20} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={typography.heading[600]}>前台修改建議審查</Typography>
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            {stations.length} 個站點有待審建議 · 核准前原資料不變動
          </Typography>
        </Box>
        <IconButton aria-label="關閉" onClick={onClose}>
          <X size={20} />
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
              <CheckCheck size={32} />
              <Typography sx={{ ...typography.label[400], mt: '10px' }}>
                {queue.isPending ? '載入中…' : '佇列已清空'}
              </Typography>
              {queue.isPending ? null : (
                <Typography sx={typography.body[300]}>
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
                  <Badge tone="warning" size="sm">
                    {pendingFieldsLabel(station.pendingFieldCount)}
                  </Badge>
                </ButtonBase>
              );
            })
          )}
        </Box>

        {current ? (
          <StationReview
            key={current.uuid}
            uuid={current.uuid}
            canEdit={canEdit}
            canViewHistory={canViewHistory}
            onEditStation={onEditStation}
          />
        ) : (
          <Box />
        )}
      </Box>
    </MuiDialog>
  );
}

function StationReview({
  uuid,
  canEdit,
  canViewHistory,
  onEditStation,
}: {
  uuid: string;
  canEdit: boolean;
  canViewHistory: boolean;
  onEditStation: (uuid: string) => void;
}) {
  const review = useStationReview({ uuid });
  // Conflicts come from the station's history; without it they are unknown, never "none".
  const history = useStationHistory(
    { path: { uuid }, query: { limit: 100 } },
    { enabled: canViewHistory },
  );
  const historyEvents = history.isSuccess ? (history.data?.data ?? []) : null;
  const merge = useMergeStationSuggestions();
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [note, setNote] = useState('');

  const fields = useMemo(
    () => (review.data ? buildReviewFields(review.data, historyEvents) : []),
    [review.data, historyEvents],
  );
  const enumOptions = useMemo(
    () =>
      Object.fromEntries(
        (review.data?.suggestableFields ?? [])
          .filter((f) => f.dataType === 'enum' && f.enumOptions)
          .map((f) => [f.fieldName, f.enumOptions ?? []]),
      ),
    [review.data],
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

  if (review.isPending) {
    return <Box sx={{ p: 3, ...typography.body[300] }}>載入中…</Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: '20px 24px' }}>
        <Typography sx={{ ...typography.heading[600], mb: '4px' }}>
          {review.data?.station?.name ?? '站點'}
        </Typography>
        <Typography
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.muted,
            mb: '16px',
          }}
        >
          欄位級對比：目前值 → 建議值。不決定的欄位會繼續留在佇列。
        </Typography>
        {fields.length > 0 && !historyEvents ? (
          <Box sx={{ mb: '12px' }}>
            <Callout tone="warning">
              {canViewHistory && history.isPending
                ? '正在讀取版本歷史，衝突檢查完成前請先確認目前值。'
                : '無法讀取這個站點的版本歷史，無法檢查建議提出後欄位是否被改過。'}
            </Callout>
          </Box>
        ) : null}
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
          gap: '10px',
          p: '14px 24px',
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
            size="sm"
            onClick={() => onEditStation(uuid)}
          >
            直接編輯站點
          </Button>
        ) : null}
        <Button
          size="sm"
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
        border: `1px solid ${field.conflict ? color.bg.danger.default : color.border.default}`,
        borderRadius: `${radius.lg}px`,
        p: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Typography sx={typography.label[400]}>{field.label}</Typography>
        {field.conflict ? (
          <Badge
            tone="danger"
            variant="solid"
            size="sm"
            icon={<Zap size={11} />}
          >
            衝突
          </Badge>
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

      {field.conflict ? (
        <Callout tone="danger">
          這個欄位在建議提出後已被更新，請確認目前值後再決定。
        </Callout>
      ) : null}

      <Box
        sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}
      >
        <ValueBox label="目前值" value={field.currentValue} />
        <Box>
          <Typography
            sx={{
              ...typography.data[300],
              color: color.fg.neutral.muted,
              mb: '4px',
            }}
          >
            採用的值
          </Typography>
          {options && options.length > 0 ? (
            <TextField
              select
              size="small"
              fullWidth
              value={value}
              onChange={(e) => setFinal(e.target.value)}
            >
              {options.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextInput
              value={value}
              onChange={(e) => setFinal(e.target.value)}
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

function ValueBox({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        sx={{
          ...typography.data[300],
          color: color.fg.neutral.muted,
          mb: '4px',
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          ...typography.body[300],
          p: '9px 12px',
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          border: `1px solid ${color.border.default}`,
          minHeight: 40,
          wordBreak: 'break-word',
        }}
      >
        {value || '（空）'}
      </Box>
    </Box>
  );
}
