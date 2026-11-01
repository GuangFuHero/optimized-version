'use client';

import { Box, Dialog as MuiDialog, Stack } from '@mui/material';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Lock,
  Merge,
  RefreshCw,
} from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@rescue-frontend/data-access';
import {
  useDecideDuplicatePair,
  useDisasterTypes,
  useDuplicatePair,
  useResolveDuplicatePair,
  useTicketPropertyConfigs,
  type DuplicatePairDetail,
} from '@rescue-frontend/data-access/admin';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';

import { getOperationalStatusMeta } from '../../station/operational-status';
import { getStationTypeLabel } from '../../station/type-options';
import {
  formatTicketStatusLabel,
  formatTicketTypeLabel,
} from '../../ticket/status';
import {
  defaultPlan,
  duplicateTasks,
  headcount,
  gapText,
  isEdited,
  isPending,
  mergeProblems,
  NOTE_MAX_LENGTH,
  orderedSides,
  OUTCOME_LABELS,
  outcomeOf,
  otherNeeds,
  pairSignals,
  photoRows,
  pickedSide,
  resolveRequest,
  resultText,
  resultValue,
  shortTime,
  ticketFields,
  type FieldLabels,
  type MergeField,
  type MergePlan,
  type PairFields,
  type Side,
} from './model';
import { Chip, LetterDot, letter, muted, scrollbarSx, subtle } from './parts';

const { color, radius, shadow, typography } = designTokens;
const LABEL_W = 132;
const COL_W = 300;

type ConfirmMode = 'merge' | 'separate' | 'confirm';

function useFieldLabels(pair: DuplicatePairDetail | undefined): FieldLabels {
  const types = [
    ...new Set([
      ...(pair?.tickets?.low?.disaster_types ?? []),
      ...(pair?.tickets?.high?.disaster_types ?? []),
    ]),
  ];
  // Inactive settings need the edit permissions (ADR-226): an inactive answer shows its key.
  const ticketConfigs = useTicketPropertyConfigs(
    { disasterTypes: types, includeInactive: false },
    { enabled: Boolean(pair?.tickets) },
  );
  const disasterTypes = useDisasterTypes(
    { includeInactive: false },
    { enabled: Boolean(pair?.tickets) },
  );
  return useMemo<FieldLabels>(() => {
    const ticketList = ticketConfigs.data?.ticketPropertyConfigs ?? [];
    const typeList = disasterTypes.data?.disasterTypes ?? [];
    return {
      disaster: (name) => {
        const index = ticketList.findIndex((c) => c.propertyName === name);
        const config = ticketList[index];
        return {
          label: config?.displayLabel || config?.label || name,
          order: index < 0 ? 9999 : index,
          inactive: false,
          dataType: config?.dataType,
          options: config?.enumOptions,
          unit: config?.unit,
        };
      },
      disasterType: (key) => typeList.find((t) => t.key === key)?.label || key,
      taskType: (key) => formatTicketTypeLabel(key),
    };
  }, [ticketConfigs.data, disasterTypes.data]);
}

export function CompareView({
  pairUuid,
  canView,
  canReview,
  neighbours,
  onOpen,
}: {
  pairUuid: string;
  canView: boolean;
  canReview: boolean;
  neighbours: string[];
  onOpen: (uuid: string | null) => void;
}) {
  const detail = useDuplicatePair(pairUuid, { enabled: canView });
  const pair = detail.data;
  const labels = useFieldLabels(pair);

  const index = neighbours.indexOf(pairUuid);
  const prev = index > 0 ? neighbours[index - 1] : null;
  const next =
    index >= 0 && index < neighbours.length - 1 ? neighbours[index + 1] : null;

  if (detail.isPending) {
    return <Box sx={{ ...typography.body[300], ...muted }}>載入中…</Box>;
  }
  if (detail.isError || !pair) {
    return (
      <Stack sx={{ gap: 2, maxWidth: 640, alignItems: 'flex-start' }}>
        <BackButton onBack={() => onOpen(null)} />
        <Callout tone="danger">
          {detail.error instanceof ApiError && detail.error.status === 404
            ? '找不到這一對，可能已經被處理或刪除。'
            : '無法載入這一對，請重新整理頁面。'}
        </Callout>
      </Stack>
    );
  }

  return (
    <PairCompare
      // A reload after a 409 starts the comparison over on what is there now.
      key={`${pair.uuid}:${pair.tickets?.low?.version}:${pair.tickets?.high?.version}`}
      pair={pair}
      labels={labels}
      canReview={canReview}
      position={index >= 0 ? [index + 1, neighbours.length] : null}
      onBack={() => onOpen(null)}
      onPrev={prev ? () => onOpen(prev) : null}
      onNext={next ? () => onOpen(next) : null}
      // After a decision: the next pair on the list, or back to the list when it was the last.
      onHandled={() => onOpen(next ?? prev ?? null)}
      onReload={() => detail.refetch()}
    />
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button
      variant="outline"
      startIcon={<ArrowLeft size={16} />}
      onClick={onBack}
      data-dedup-back
    >
      回清單
    </Button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      disabled={!onClick}
      onClick={onClick ?? undefined}
      sx={{
        border: 'none',
        bgcolor: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        lineHeight: 0,
        width: 32,
        height: 32,
        borderRadius: `${radius.full}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: onClick ? 1 : 0.35,
        p: '1px 6px',
        color: '#000',
        '&:hover:not(:disabled)': { bgcolor: color.bg.neutral.subtle },
      }}
    >
      {children}
    </Box>
  );
}

function PairCompare({
  pair,
  labels,
  canReview,
  position,
  onBack,
  onPrev,
  onNext,
  onHandled,
  onReload,
}: {
  pair: DuplicatePairDetail;
  labels: FieldLabels;
  canReview: boolean;
  position: [number, number] | null;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onHandled: () => void;
  onReload: () => void;
}) {
  const ticketCard = pair.entity_kind !== 'station';
  const pending = isPending(pair);
  // 留一張 needs both tickets live; a side cancelled or deleted can only be judged (Spec 028 §2).
  const mergeable =
    ticketCard && Boolean(pair.tickets?.low && pair.tickets?.high);
  const fields = useMemo(
    () => (mergeable ? ticketFields(pair, labels) : null),
    [pair, labels, mergeable],
  );
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const currentPlan = plan ?? (fields ? defaultPlan(pair, fields) : null);
  const [diffOnly, setDiffOnly] = useState(false);
  const [stale, setStale] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmMode | null>(null);
  const editable = pending && canReview;

  const update = (change: (plan: MergePlan) => MergePlan) =>
    setPlan((p) => change(p ?? (currentPlan as MergePlan)));

  return (
    <Stack
      sx={{ gap: 1.5, height: '100%', minHeight: 560 }}
      data-dedup-compare={pair.uuid}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        <BackButton onBack={onBack} />
        <Box
          component="h1"
          sx={{
            ...typography.heading[600],
            fontSize: 18,
            m: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {ticketCard ? '兩張任務單可能重複' : '兩個站點可能重複'}
        </Box>
        {pending && pair.similarity != null ? (
          <Badge tone="warning">
            相似度 {Math.round(pair.similarity * 100)}%
          </Badge>
        ) : null}
        <Box component="span" sx={{ ...typography.data[300], ...muted }}>
          發現於 {shortTime(pair.created_at)}
        </Box>
        <Box sx={{ flex: 1 }} />
        {position ? (
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
            <IconButton label="上一對" onClick={onPrev}>
              <ChevronLeft size={18} />
            </IconButton>
            <Box
              component="span"
              sx={{
                ...typography.data[300],
                ...muted,
                minWidth: 54,
                textAlign: 'center',
              }}
            >
              第 {position[0]} / {position[1]} 對
            </Box>
            <IconButton label="下一對" onClick={onNext}>
              <ChevronRight size={18} />
            </IconButton>
          </Stack>
        ) : null}
      </Stack>

      {!pending ? (
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            ...scrollbarSx,
            p: 2.5,
            border: `1px solid ${color.border.default}`,
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
          }}
        >
          <DoneDetail pair={pair} labels={labels} />
        </Box>
      ) : (
        <>
          <Stack
            direction="row"
            sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}
          >
            <Box component="span" sx={{ ...typography.label[300], ...subtle }}>
              為什麼可能重複：
            </Box>
            {pairSignals(
              pair,
              ticketCard ? labels.taskType : getStationTypeLabel,
            ).map((signal) => (
              <Chip key={signal}>{signal}</Chip>
            ))}
            <Box sx={{ flex: 1 }} />
            <Box
              component="label"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                ...typography.body[300],
                ...subtle,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={diffOnly}
                onChange={(e) => setDiffOnly(e.target.checked)}
                data-dedup-diffonly
              />
              只看有差異的欄位
            </Box>
          </Stack>
          {!canReview ? (
            <Callout tone="info">
              你目前的身分可以查看，但不能處理這一對。
            </Callout>
          ) : null}
          {ticketCard && !mergeable ? (
            <Callout tone="warning">
              其中一張任務單已經取消或刪除，不能合併，只能記下「確認重複」或「不是重複」。
            </Callout>
          ) : null}
          {stale ? (
            <Callout tone="warning">
              <Stack sx={{ gap: 1, alignItems: 'flex-start' }}>
                <span>
                  這一對在你打開後有變動：有一張被改過，或已經由其他人處理。為了不蓋掉別人的修改，請先重新載入，看過最新內容再決定。
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  startIcon={<RefreshCw size={14} />}
                  onClick={() => {
                    setStale(false);
                    onReload();
                  }}
                >
                  重新載入最新內容
                </Button>
              </Stack>
            </Callout>
          ) : null}

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1.5 }}>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                border: `1px solid ${color.border.default}`,
                borderRadius: `${radius.lg}px`,
                bgcolor: color.bg.neutral.default,
                overflow: 'hidden',
              }}
            >
              <CompareTable
                pair={pair}
                fields={fields}
                plan={currentPlan}
                editable={editable && mergeable}
                diffOnly={diffOnly}
                onPick={(field, side) =>
                  update((p) =>
                    field.primary
                      ? { ...p, primary: side }
                      : {
                          ...p,
                          picks: { ...p.picks, [field.id]: side },
                          // Picking a cell on the left gives up what was typed on the right.
                          edits: Object.fromEntries(
                            Object.entries(p.edits).filter(
                              ([id]) => id !== field.id,
                            ),
                          ),
                        },
                  )
                }
                onToggleNeed={(uuid, on) =>
                  update((p) => ({
                    ...p,
                    needOff: { ...p.needOff, [uuid]: !on },
                  }))
                }
                onTogglePhoto={(uuid, on) =>
                  update((p) => ({
                    ...p,
                    photoOff: { ...p.photoOff, [uuid]: !on },
                  }))
                }
              />
            </Box>
            {mergeable && fields && currentPlan ? (
              <ResultPanel
                pair={pair}
                fields={fields}
                plan={currentPlan}
                editable={editable}
                onEdit={(field, text) =>
                  update((p) => {
                    const edits = { ...p.edits };
                    if (text == null) delete edits[field.id];
                    else edits[field.id] = text;
                    return { ...p, edits };
                  })
                }
              />
            ) : null}
          </Box>

          <ActionBar
            pair={pair}
            editable={editable}
            mergeable={mergeable}
            fields={fields}
            plan={currentPlan}
            onSeparate={() => setConfirm('separate')}
            onConfirmDuplicate={() => setConfirm('confirm')}
            onMerge={() => setConfirm('merge')}
          />
          {confirm && editable ? (
            <ConfirmDialog
              mode={confirm}
              pair={pair}
              fields={fields}
              plan={currentPlan}
              onClose={() => setConfirm(null)}
              onStale={() => {
                setConfirm(null);
                setStale(true);
              }}
              onDone={() => {
                setConfirm(null);
                onHandled();
              }}
            />
          ) : null}
        </>
      )}
    </Stack>
  );
}

// ── The left: both sides, side by side ──────────────────────────────────────────────────────

const stickyEdge = `8px 0 0 ${color.bg.neutral.default}, 9px 0 0 ${color.border.default}`;

function Label({ children, top = 10 }: { children: ReactNode; top?: number }) {
  return (
    <Box
      sx={{
        position: 'sticky',
        left: 0,
        zIndex: 1,
        bgcolor: color.bg.neutral.default,
        pl: 2,
        pt: `${top}px`,
        ...typography.label[300],
        ...subtle,
        boxShadow: stickyEdge,
      }}
    >
      {children}
    </Box>
  );
}

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <Box
      sx={{
        gridColumn: '1 / -1',
        p: '18px 0 6px',
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          left: 0,
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 1,
          flexWrap: 'wrap',
          maxWidth: 'min(100%, 860px)',
          pl: 0.5,
        }}
      >
        <Box component="span" sx={typography.label[400]}>
          {title}
        </Box>
        {note ? (
          <Box component="span" sx={{ ...typography.body[300], ...muted }}>
            {note}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function SameCell({ text, tail }: { text: string; tail?: string }) {
  return (
    <Box
      sx={{
        gridColumn: '2 / span 2',
        p: '8px 10px',
        ...typography.body[300],
        ...muted,
        display: 'flex',
        gap: 1,
        alignItems: 'center',
      }}
    >
      <Box
        component="span"
        sx={{ color: color.fg.neutral.default, whiteSpace: 'pre-wrap' }}
      >
        {text}
      </Box>
      <Box component="span" sx={typography.data[300]}>
        · {tail ?? '兩張相同'}
      </Box>
    </Box>
  );
}

const infoSx = {
  p: '6px 10px',
  ...typography.body[300],
  ...subtle,
  minWidth: 0,
} as const;

function CheckRow({
  on,
  disabled,
  onChange,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        cursor: disabled ? 'default' : 'pointer',
        minWidth: 0,
      }}
    >
      <Box
        component="input"
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
        sx={{
          width: 16,
          height: 16,
          flexShrink: 0,
          m: '3px 3px 3px 4px',
          accentColor: color.bg.primary.default,
        }}
      />
      {children}
    </Box>
  );
}

function CompareTable({
  pair,
  fields,
  plan,
  editable,
  diffOnly,
  onPick,
  onToggleNeed,
  onTogglePhoto,
}: {
  pair: DuplicatePairDetail;
  fields: PairFields | null;
  plan: MergePlan | null;
  editable: boolean;
  diffOnly: boolean;
  onPick: (field: MergeField, side: Side) => void;
  onToggleNeed: (uuid: string, on: boolean) => void;
  onTogglePhoto: (uuid: string, on: boolean) => void;
}) {
  const sides = orderedSides(pair);
  const first = pair[sides[0]].created_at;
  const gap = gapText(first, pair[sides[1]].created_at);
  const sameTime = gap === '同時';
  // A deleted side has no creation time: then neither side is called 最早 or later.
  const timed = gap !== '' && !sameTime;
  let hiddenSame = 0;

  const plainRow = (
    key: string,
    label: string,
    read: (side: Side) => string,
  ) => {
    const values = sides.map(read);
    const same = values[0] === values[1];
    if (same && diffOnly) {
      hiddenSame += 1;
      return null;
    }
    return (
      <Box key={key} sx={{ display: 'contents' }}>
        <Label top={8}>{label}</Label>
        {same ? (
          <SameCell text={values[0]} />
        ) : (
          values.map((value, i) => (
            <Box
              key={sides[i]}
              sx={{
                p: '8px 10px',
                borderRadius: `${radius.sm}px`,
                bgcolor: color.bg.neutral.subtle,
                ...typography.body[300],
                color: color.fg.neutral.default,
              }}
            >
              {value}
            </Box>
          ))
        )}
      </Box>
    );
  };

  const pickRow = (field: MergeField) => {
    const values = sides.map((side) => field.show(field.read(side)));
    const same = values[0] === values[1];
    if (same && diffOnly) {
      hiddenSame += 1;
      return null;
    }
    const edited = plan ? isEdited(field, plan) : false;
    return (
      <Box key={field.id} sx={{ display: 'contents' }}>
        <Label>
          {field.label}
          {field.inactive ? (
            <Box
              component="span"
              sx={{ display: 'block', ...typography.data[300], ...muted }}
            >
              已停用的欄位
            </Box>
          ) : null}
        </Label>
        {same ? (
          <SameCell
            text={values[0]}
            tail={edited ? '兩張相同 · 右邊已修改' : undefined}
          />
        ) : (
          sides.map((side, i) => {
            // A row typed over on the right has neither cell chosen: picking one gives that up.
            const chosen =
              Boolean(plan) &&
              !edited &&
              pickedSide(field, plan as MergePlan) === side;
            return (
              <Box
                key={side}
                component="button"
                type="button"
                disabled={!editable}
                aria-pressed={chosen}
                onClick={() => onPick(field, side)}
                data-dedup-cell={`${field.id}=${letter(i)}`}
                sx={{
                  textAlign: 'left',
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                  p: '8px 10px',
                  ...typography.body[300],
                  color: color.fg.neutral.default,
                  cursor: editable ? 'pointer' : 'default',
                  borderRadius: `${radius.sm}px`,
                  border: `1px solid ${chosen ? color.bg.primary.default : color.border.default}`,
                  bgcolor: chosen
                    ? color.bg.primary.subtle
                    : color.bg.neutral.default,
                  '&:not(:disabled):hover': {
                    borderColor: color.border.accent,
                  },
                }}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    width: 16,
                    height: 16,
                    mt: '2px',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    borderRadius: `${radius.full}px`,
                    border: `2px solid ${chosen ? color.bg.primary.default : color.border.default}`,
                    bgcolor: chosen ? color.bg.primary.default : 'transparent',
                    boxShadow: chosen
                      ? `inset 0 0 0 2px ${color.bg.neutral.default}`
                      : 'none',
                  }}
                />
                <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
                  {values[i]}
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    );
  };

  const ticketCard = Boolean(fields);
  const station = pair.entity_kind === 'station';
  const needs = fields && plan ? otherNeeds(pair, plan) : [];
  const photos = fields && plan ? photoRows(pair, plan) : [];

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        overflow: 'auto',
        p: '0 16px 16px 0',
        ...scrollbarSx,
      }}
      data-dedup-scroll
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_W}px repeat(2, minmax(${COL_W}px, 1fr))`,
          columnGap: 1,
          rowGap: 0.75,
          minWidth: LABEL_W + 2 * (COL_W + 8),
        }}
        data-dedup-table
      >
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 3,
            bgcolor: color.bg.neutral.default,
            p: '0 8px 0 16px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${color.border.default}`,
            boxShadow: stickyEdge,
            ...typography.label[300],
            ...subtle,
          }}
        >
          {station ? '兩個站點' : '兩張任務單'}
        </Box>
        {sides.map((side, i) => {
          const s = pair[side];
          const isFirst = i === 0;
          return (
            <Stack
              key={side}
              direction="row"
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                bgcolor: color.bg.neutral.default,
                alignItems: 'center',
                gap: 1,
                height: 44,
                p: '0 8px 0 10px',
                minWidth: 0,
                borderBottom: `1px solid ${color.border.default}`,
              }}
              data-dedup-col={letter(i)}
            >
              <LetterDot index={i} />
              <Box
                sx={{
                  minWidth: 0,
                  flex: 1,
                  ...typography.label[300],
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.deleted
                  ? '已刪除'
                  : (s.ticket_title ?? s.title ?? '（沒有名稱）')}
              </Box>
              {timed ? (
                <Box
                  component="span"
                  sx={{
                    ...typography.data[300],
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    fontWeight: isFirst ? 700 : 400,
                    ...(isFirst ? {} : muted),
                  }}
                >
                  {isFirst ? '最早' : `晚 ${gapText(first, s.created_at)}`}
                </Box>
              ) : null}
            </Stack>
          );
        })}

        <Section title="基本資料" note="依建立時間排，A 最早" />
        <Box sx={{ display: 'contents' }}>
          <Label top={6}>建立時間</Label>
          {sameTime ? (
            <SameCell text={shortTime(first)} tail="兩張同時建立" />
          ) : (
            sides.map((side, i) => (
              <Box key={side} sx={infoSx}>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flexWrap: 'wrap',
                  }}
                >
                  <Box
                    component="span"
                    sx={{ color: color.fg.neutral.default }}
                  >
                    {shortTime(pair[side].created_at)}
                  </Box>
                  {!timed ? null : i === 0 ? (
                    <Chip icon={<Clock size={12} />}>最早</Chip>
                  ) : (
                    <Box
                      component="span"
                      sx={{ ...typography.data[300], ...muted }}
                    >
                      比另一{ticketCard ? '張' : '個'}晚{' '}
                      {gapText(first, pair[side].created_at)}
                    </Box>
                  )}
                </Box>
              </Box>
            ))
          )}
        </Box>

        {ticketCard && fields ? (
          <>
            <Section
              title="任務單的欄位"
              note={editable ? '點一格，就把那個值帶到右邊的合併結果' : '唯讀'}
            />
            {fields.ticket.map(pickRow)}
            {fields.task.length ? (
              <>
                <Section
                  title="重複的需求"
                  note={editable ? '會合併成一筆；點一格帶到右邊' : '唯讀'}
                />
                {fields.task.map(pickRow)}
              </>
            ) : null}
            {needs.length || photos.length ? (
              <Section
                title="其他需求與照片"
                note={
                  editable ? '勾的會放進合併後的任務單，沒勾的取消' : '唯讀'
                }
              />
            ) : null}
            {needs.length ? (
              <Box sx={{ display: 'contents' }}>
                <Label>其他需求</Label>
                {sides.map((side) => {
                  const rows = needs.filter((n) => n.side === side);
                  return (
                    <Stack
                      key={side}
                      sx={{ gap: 0.75, py: 0.5 }}
                      data-dedup-needs={side}
                    >
                      {rows.length === 0 ? (
                        <Box sx={{ ...infoSx, ...muted }}>沒有</Box>
                      ) : null}
                      {rows.map(({ task, included }) => (
                        <Box
                          key={task.uuid}
                          sx={{
                            p: '8px 10px',
                            borderRadius: `${radius.sm}px`,
                            bgcolor: included
                              ? color.bg.primary.subtle
                              : 'transparent',
                            border: `1px solid ${included ? color.bg.primary.default : color.border.default}`,
                          }}
                        >
                          <CheckRow
                            on={included}
                            disabled={!editable}
                            onChange={(on) => onToggleNeed(task.uuid, on)}
                          >
                            <Box
                              component="span"
                              sx={{
                                flex: 1,
                                minWidth: 0,
                                ...typography.body[300],
                                color: included
                                  ? color.fg.neutral.default
                                  : color.fg.neutral.muted,
                              }}
                            >
                              {task.task_name}
                              {task.quantity != null
                                ? ` ×${task.quantity}`
                                : ''}
                              <Box
                                component="span"
                                sx={{ ...typography.data[300], ...muted }}
                              >
                                {' '}
                                · {formatTicketTypeLabel(task.task_type)}
                                {task.claim_count
                                  ? ` · ${task.claim_count} 位志工承接`
                                  : ''}
                              </Box>
                            </Box>
                          </CheckRow>
                        </Box>
                      ))}
                    </Stack>
                  );
                })}
              </Box>
            ) : null}
            {photos.length ? (
              <Box sx={{ display: 'contents' }}>
                <Label>照片</Label>
                {sides.map((side) => {
                  const rows = photos.filter((p) => p.side === side);
                  return (
                    <Stack
                      key={side}
                      direction="row"
                      sx={{ flexWrap: 'wrap', gap: 1, py: 0.5 }}
                      data-dedup-photos={side}
                    >
                      {rows.length === 0 ? (
                        <Box sx={{ ...infoSx, ...muted }}>沒有</Box>
                      ) : null}
                      {rows.map(({ photo, included }) => (
                        <Stack key={photo.uuid} sx={{ width: 132, gap: 0.75 }}>
                          <Box
                            component="img"
                            src={photo.url}
                            alt=""
                            sx={{
                              width: 132,
                              height: 84,
                              objectFit: 'cover',
                              borderRadius: `${radius.md}px`,
                              opacity: included ? 1 : 0.45,
                              border: `1px solid ${included ? color.bg.primary.default : color.border.default}`,
                              bgcolor: color.bg.neutral.sunken,
                            }}
                          />
                          <CheckRow
                            on={included}
                            disabled={!editable}
                            onChange={(on) => onTogglePhoto(photo.uuid, on)}
                          >
                            <Box
                              component="span"
                              sx={{ ...typography.body[300], ...subtle }}
                            >
                              放進去
                            </Box>
                          </CheckRow>
                        </Stack>
                      ))}
                    </Stack>
                  );
                })}
              </Box>
            ) : null}
          </>
        ) : (
          <>
            <Section
              title={station ? '站點的欄位' : '兩邊的資料'}
              note={
                station
                  ? '只並排參考。站點這一版還不能合併，只能記下是不是重複。'
                  : undefined
              }
            />
            {plainRow('title', station ? '站點名稱' : '名稱', (side) =>
              pair[side].deleted ? '已刪除' : (pair[side].title ?? '（未填）'),
            )}
            {!station
              ? plainRow(
                  'ticket',
                  '任務單',
                  (side) => pair[side].ticket_title ?? '（已取消或刪除）',
                )
              : null}
            {plainRow('type', '類型', (side) =>
              !pair[side].type
                ? '（未填）'
                : station
                  ? getStationTypeLabel(pair[side].type)
                  : formatTicketTypeLabel(pair[side].type),
            )}
            {plainRow('status', station ? '營運狀態' : '狀態', (side) =>
              !pair[side].status
                ? '（未填）'
                : station
                  ? getOperationalStatusMeta(pair[side].status).label
                  : formatTicketStatusLabel(pair[side].status),
            )}
            {plainRow('location', '位置', (side) =>
              pair[side].latitude != null && pair[side].longitude != null
                ? `${pair[side].latitude?.toFixed(5)}, ${pair[side].longitude?.toFixed(5)}`
                : '（未填）',
            )}
          </>
        )}

        {hiddenSame > 0 || (fields?.empty.length ?? 0) > 0 ? (
          <Stack
            sx={{
              gridColumn: '1 / -1',
              p: '10px 4px 0',
              gap: 0.25,
              ...typography.data[300],
              ...muted,
            }}
          >
            {hiddenSame > 0 ? (
              <span>已隱藏 {hiddenSame} 個兩張相同的欄位</span>
            ) : null}
            {fields?.empty.length ? (
              <span>兩張都沒填、所以沒列出來：{fields.empty.join('、')}</span>
            ) : null}
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
}

// ── The right: the merged ticket, typed over in place (DUP-BE-432) ─────────────────────────

const claimedOf = (pair: DuplicatePairDetail) => {
  const tasks = duplicateTasks(pair);
  return tasks ? headcount([tasks.low, tasks.high]) : 0;
};

function ResultField({
  field,
  plan,
  editable,
  problem,
  hint,
  onEdit,
}: {
  field: MergeField;
  plan: MergePlan;
  editable: boolean;
  problem?: string;
  hint?: string;
  onEdit: (field: MergeField, text: string | null) => void;
}) {
  const edited = isEdited(field, plan);
  const fixed = field.locked || !editable;
  const text = resultText(field, plan);
  const boxSx = {
    width: '100%',
    boxSizing: 'border-box',
    p: '6px 8px',
    borderRadius: `${radius.sm}px`,
    ...typography.body[300],
    color: color.fg.neutral.default,
    border: `1px solid ${edited ? color.fg.warning : color.border.default}`,
    bgcolor: color.bg.neutral.default,
  } as const;
  const change = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => onEdit(field, e.target.value);
  const attrs = {
    'aria-label': field.label,
    'data-dedup-result-input': field.id,
  };

  let input: ReactNode;
  if (fixed) {
    input = (
      <Box
        component="span"
        sx={{ ...typography.body[300], py: 0.75, whiteSpace: 'pre-wrap' }}
      >
        {field.show(resultValue(field, plan))}
      </Box>
    );
  } else if (field.input === 'select' && field.options) {
    const known = field.options.some(([value]) => value === text);
    input = (
      <Box
        component="select"
        value={text}
        onChange={change}
        sx={boxSx}
        {...attrs}
      >
        {text !== '' && !known ? <option value={text}>{text}</option> : null}
        {text === '' ? <option value="">（未填）</option> : null}
        {field.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Box>
    );
  } else if (field.input === 'long') {
    input = (
      <Box
        component="textarea"
        value={text}
        rows={Math.min(5, Math.max(2, Math.ceil(text.length / 22)))}
        onChange={change}
        sx={{ ...boxSx, resize: 'vertical' }}
        {...attrs}
      />
    );
  } else {
    input = (
      <Box
        component="input"
        type={field.input === 'number' ? 'number' : 'text'}
        min={field.input === 'number' ? 0 : undefined}
        value={text}
        onChange={change}
        placeholder={field.input === 'list' ? '用「、」分開' : undefined}
        sx={boxSx}
        {...attrs}
      />
    );
  }

  return (
    <Stack
      sx={{
        gap: 0.5,
        py: 1,
        borderTop: `1px solid ${color.bg.neutral.sunken}`,
      }}
      data-dedup-result-field={field.id}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 0.75, minHeight: 20 }}
      >
        <Box component="span" sx={{ ...typography.label[300], ...subtle }}>
          {field.label}
        </Box>
        {field.primary && editable ? (
          <Box component="span" sx={{ ...typography.data[300], ...muted }}>
            · 在左邊選
          </Box>
        ) : null}
        {edited ? <Chip tone="warning">已修改</Chip> : null}
        <Box sx={{ flex: 1 }} />
        {edited && editable ? (
          <Box
            component="button"
            type="button"
            onClick={() => onEdit(field, null)}
            data-dedup-result-revert={field.id}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: 24,
              px: 1.25,
              borderRadius: `${radius.full}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: color.bg.neutral.default,
              cursor: 'pointer',
              ...typography.data[300],
              fontWeight: 700,
              ...subtle,
              '&:hover': {
                bgcolor: color.bg.neutral.subtle,
                borderColor: color.border.accent,
              },
            }}
          >
            還原
          </Box>
        ) : null}
      </Stack>
      {input}
      {hint || problem ? (
        <Box
          component="span"
          sx={{
            ...typography.data[300],
            color: problem ? color.fg.danger : color.fg.neutral.muted,
          }}
          data-dedup-qty-hint={field.id === 'task:quantity' ? true : undefined}
        >
          {problem ?? hint}
        </Box>
      ) : null}
    </Stack>
  );
}

function ResultPanel({
  pair,
  fields,
  plan,
  editable,
  onEdit,
}: {
  pair: DuplicatePairDetail;
  fields: PairFields;
  plan: MergePlan;
  editable: boolean;
  onEdit: (field: MergeField, text: string | null) => void;
}) {
  const problems = mergeProblems(pair, fields, plan);
  const tasks = duplicateTasks(pair);
  const allNeeds = otherNeeds(pair, plan);
  const needs = allNeeds.filter((n) => n.included);
  const allPhotos = photoRows(pair, plan);
  const photos = allPhotos.filter((p) => p.included);
  const claimed = claimedOf(pair);
  const sum = tasks
    ? (tasks.low.quantity ?? 0) + (tasks.high.quantity ?? 0)
    : 0;

  const field = (f: MergeField) => (
    <ResultField
      key={f.id}
      field={f}
      plan={plan}
      editable={editable}
      problem={problems.find((p) => p.field === f.id)?.message}
      hint={
        f.id === 'task:quantity'
          ? `兩張加起來是 ${sum}${claimed ? ` · ${claimed} 位志工承接，不能少於 ${claimed}` : ''}`
          : undefined
      }
      onEdit={onEdit}
    />
  );

  return (
    <Box
      component="aside"
      data-dedup-result
      sx={{
        width: 380,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        border: `1px solid ${color.bg.primary.default}`,
        borderRadius: `${radius.lg}px`,
        bgcolor: color.bg.neutral.default,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        sx={{
          p: '10px 16px',
          gap: 1,
          alignItems: 'center',
          bgcolor: color.bg.primary.subtle,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Merge size={16} color={color.bg.primary.default} />
        <Box component="span" sx={typography.label[400]}>
          合併後的任務單
        </Box>
        <Box component="span" sx={{ ...typography.data[300], ...muted }}>
          {editable ? '可以直接改' : ''}
        </Box>
      </Stack>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: '4px 16px 16px',
          ...scrollbarSx,
        }}
      >
        {fields.ticket.map(field)}
        {fields.task.length ? (
          <Box
            sx={{
              mt: 1.5,
              p: '4px 12px 6px',
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.bg.primary.default}`,
              bgcolor: color.bg.primary.subtle,
            }}
          >
            <Stack
              direction="row"
              sx={{ gap: 0.75, alignItems: 'center', p: '6px 0 2px' }}
            >
              <Box component="span" sx={typography.label[300]}>
                合併的這一筆需求
              </Box>
              {claimed ? (
                <Box
                  component="span"
                  sx={{ ...typography.data[300], ...muted }}
                >
                  · {claimed} 位志工承接
                </Box>
              ) : null}
            </Stack>
            {fields.task.map(field)}
          </Box>
        ) : null}
        {allNeeds.length ? (
          <Stack sx={{ mt: 1.5, gap: 0.75 }}>
            <Box component="span" sx={{ ...typography.label[300], ...subtle }}>
              其他需求 {needs.length} 項{' '}
              <Box component="span" sx={{ ...typography.data[300], ...muted }}>
                · 在左邊勾選
              </Box>
            </Box>
            {needs.map(({ task }) => (
              <Box
                key={task.uuid}
                sx={{
                  p: '6px 10px',
                  borderRadius: `${radius.sm}px`,
                  border: `1px solid ${color.border.default}`,
                  ...typography.body[300],
                }}
              >
                {task.task_name}
                {task.quantity != null ? ` ×${task.quantity}` : ''}
                <Box
                  component="span"
                  sx={{ ...typography.data[300], ...muted }}
                >
                  {' '}
                  · {formatTicketTypeLabel(task.task_type)}
                  {task.claim_count ? ` · ${task.claim_count} 位志工承接` : ''}
                </Box>
              </Box>
            ))}
          </Stack>
        ) : null}
        {allPhotos.length ? (
          <Box sx={{ mt: 1.5, ...typography.label[300], ...subtle }}>
            照片 {photos.length} 張{' '}
            <Box component="span" sx={{ ...typography.data[300], ...muted }}>
              · 在左邊勾選
            </Box>
          </Box>
        ) : null}
        {problems
          .filter((p) => !p.field)
          .map((p) => (
            <Box key={p.message} sx={{ mt: 1.5 }}>
              <Callout tone="danger">{p.message}</Callout>
            </Box>
          ))}
      </Box>
    </Box>
  );
}

// ── Actions and the confirmation (DUP-BE-402, 413) ──────────────────────────────────────────

/** What 留一張 does, in the words of the design: never which ticket is kept (DUP-BE-430). */
function mergeEffects(
  pair: DuplicatePairDetail,
  fields: PairFields,
  plan: MergePlan,
) {
  const lines = ['兩張任務單合成你在右邊看到的那一張'];
  const tasks = duplicateTasks(pair);
  if (tasks) {
    const name = fields.task.find((f) => f.id === 'task:task_name');
    const quantity = fields.task.find((f) => f.id === 'task:quantity');
    lines.push(
      `重複的需求合併成一筆「${name ? name.show(resultValue(name, plan)) : tasks[plan.primary].task_name}」，數量 ${quantity ? quantity.show(resultValue(quantity, plan)) : '（未填）'}`,
    );
  }
  const edited = [...fields.ticket, ...fields.task]
    .filter((f) => isEdited(f, plan))
    .map((f) => f.label);
  if (edited.length) lines.push(`你改過的欄位：${edited.join('、')}`);
  const needs = otherNeeds(pair, plan);
  const kept = needs.filter((n) => n.included);
  const dropped = needs.filter((n) => !n.included);
  if (kept.length) {
    lines.push(
      `其他需求放進來：${kept.map((n) => `「${n.task.task_name}」`).join('、')}`,
    );
  }
  if (dropped.length) {
    lines.push(
      `沒勾的需求取消：${dropped.map((n) => `「${n.task.task_name}」`).join('、')}`,
    );
  }
  const staying = headcount([
    ...(tasks ? [tasks.low, tasks.high] : []),
    ...kept.map((row) => row.task),
  ]);
  const cancelled = headcount(dropped.map((row) => row.task));
  if (staying) lines.push(`${staying} 位已承接的志工繼續承接，會收到通知`);
  if (cancelled) lines.push(`${cancelled} 位志工承接的需求取消了，會收到通知`);
  const photos = photoRows(pair, plan);
  const photosIn = photos.filter((p) => p.included).length;
  if (photos.length) {
    lines.push(
      `照片放進 ${photosIn} 張${photos.length - photosIn ? `，${photos.length - photosIn} 張不要` : ''}`,
    );
  }
  lines.push('通知兩邊開單的人');
  const short = ['合併成一張', `${(tasks ? 1 : 0) + kept.length} 項需求`];
  if (photosIn) short.push(`照片 ${photosIn} 張`);
  return { lines, short: short.join(' · ') };
}

function ActionBar({
  pair,
  editable,
  mergeable,
  fields,
  plan,
  onSeparate,
  onConfirmDuplicate,
  onMerge,
}: {
  pair: DuplicatePairDetail;
  editable: boolean;
  mergeable: boolean;
  fields: PairFields | null;
  plan: MergePlan | null;
  onSeparate: () => void;
  onConfirmDuplicate: () => void;
  onMerge: () => void;
}) {
  const [showEffects, setShowEffects] = useState(false);
  const effects =
    mergeable && fields && plan ? mergeEffects(pair, fields, plan) : null;
  return (
    <Box
      sx={{
        flexShrink: 0,
        position: 'relative',
        p: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 1.75,
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.lg}px`,
        bgcolor: color.bg.neutral.default,
        boxShadow: shadow.sm,
      }}
      data-dedup-actions
    >
      {editable ? (
        <>
          <Button variant="outline" onClick={onSeparate} data-dedup-separate>
            不是重複
          </Button>
          <Box sx={{ flex: 1 }} />
          {effects ? (
            <>
              <Box
                component="button"
                type="button"
                onClick={() => setShowEffects((on) => !on)}
                aria-expanded={showEffects}
                title={effects.short}
                data-dedup-effect
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  minWidth: 0,
                  p: '1px 6px',
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  ...typography.body[300],
                  ...subtle,
                  textAlign: 'right',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {effects.short}
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.25,
                    color: color.bg.primary.default,
                    ...typography.label[300],
                    whiteSpace: 'nowrap',
                  }}
                >
                  合併後會發生什麼
                  {showEffects ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronUp size={14} />
                  )}
                </Box>
              </Box>
              <Button
                startIcon={<Merge size={16} />}
                onClick={onMerge}
                data-dedup-merge
              >
                合併
              </Button>
              {showEffects ? (
                <Stack
                  role="dialog"
                  aria-label="合併後會發生什麼"
                  sx={{
                    position: 'absolute',
                    right: 14,
                    bottom: 'calc(100% + 8px)',
                    width: 'min(560px, calc(100% - 28px))',
                    zIndex: 20,
                    bgcolor: color.bg.neutral.default,
                    border: `1px solid ${color.border.default}`,
                    borderRadius: `${radius.md}px`,
                    boxShadow: shadow.lg,
                    p: '12px 16px',
                    gap: 0.75,
                  }}
                >
                  <Box component="span" sx={typography.label[400]}>
                    按下合併後
                  </Box>
                  {effects.lines.map((line) => (
                    <Box
                      key={line}
                      component="span"
                      sx={{ ...typography.body[300], ...subtle }}
                    >
                      · {line}
                    </Box>
                  ))}
                  <Box
                    component="span"
                    sx={{ ...typography.data[300], ...muted, mt: 0.5 }}
                  >
                    按下合併後會先預覽合併後的單子；確認送出後不能復原。
                  </Box>
                </Stack>
              ) : null}
            </>
          ) : (
            <>
              <Box
                component="span"
                sx={{ ...typography.body[300], ...muted, textAlign: 'right' }}
              >
                {pair.entity_kind === 'station'
                  ? '站點還不能合併，「確認重複」只記下判定，兩個站點都不會變'
                  : '「確認重複」只記下判定，任務單不會變'}
              </Box>
              <Button
                startIcon={<Check size={16} />}
                onClick={onConfirmDuplicate}
                data-dedup-confirm
              >
                確認重複
              </Button>
            </>
          )}
        </>
      ) : (
        <Stack
          direction="row"
          sx={{
            flex: 1,
            alignItems: 'center',
            gap: 1,
            ...typography.body[300],
            ...muted,
          }}
        >
          <Lock size={14} />
          你只能查看這一對
        </Stack>
      )}
    </Box>
  );
}

function ConfirmDialog({
  mode,
  pair,
  fields,
  plan,
  onClose,
  onStale,
  onDone,
}: {
  mode: ConfirmMode;
  pair: DuplicatePairDetail;
  fields: PairFields | null;
  plan: MergePlan | null;
  onClose: () => void;
  onStale: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const reject = useDecideDuplicatePair('reject');
  const confirmDuplicate = useDecideDuplicatePair('confirm');
  const resolve = useResolveDuplicatePair();
  const isMerge = mode === 'merge' && fields && plan;
  const problems = isMerge ? mergeProblems(pair, fields, plan) : [];
  const station = pair.entity_kind === 'station';
  const noun = station ? '個站點' : '張單';
  const submitting =
    reject.isPending || confirmDuplicate.isPending || resolve.isPending;
  const [error, setError] = useState<string | null>(null);

  const title = isMerge
    ? '確認合併這兩張單？'
    : mode === 'confirm'
      ? `確認這兩${noun}是重複的？`
      : `確認這兩${noun}不是重複？`;
  const sub = isMerge
    ? '合併後的任務單就是你在右邊看到的那一張。送出後不能復原，也不能拆回。'
    : mode === 'confirm'
      ? station
        ? '只記下判定，兩個站點都不會變。站點合併後端還沒做，之後做好再處理。送出後不能復原。'
        : '只記下判定，兩張單都不會變。送出後不能復原。'
      : '送出後不能復原。這一對不會再提示，除非之後有人把它們改到相似。';

  const fail = (err: unknown) =>
    setError(err instanceof Error ? err.message : '送出失敗，請再試一次。');

  const submit = () => {
    setError(null);
    // A 409 comes back as `conflict`: a ticket changed after it was read, or someone decided
    // first (ADR-374). The page says so and offers the reload; nothing was written.
    const settle = (message: string) => (result: { conflict: boolean }) => {
      if (result.conflict) {
        onStale();
        return;
      }
      toast.success(message);
      onDone();
    };
    if (isMerge) {
      resolve.mutate(
        { pairUuid: pair.uuid, body: resolveRequest(pair, fields, plan, note) },
        { onSuccess: settle('已合併成一張任務單'), onError: fail },
      );
    } else if (mode === 'confirm') {
      confirmDuplicate.mutate(
        { pairUuid: pair.uuid, note: note.trim() },
        { onSuccess: settle('已記下「確認重複」'), onError: fail },
      );
    } else {
      reject.mutate(
        { pairUuid: pair.uuid, note: note.trim() },
        { onSuccess: settle('已記下「不是重複」'), onError: fail },
      );
    }
  };

  const sides = orderedSides(pair);
  const effects = isMerge
    ? mergeEffects(pair, fields, plan).lines
    : [
        `${sides
          .map((side, i) =>
            pair[side].deleted
              ? `${letter(i)}（已刪除）`
              : `${letter(i)} ${pair[side].title ?? pair[side].ticket_title ?? ''}`,
          )
          .join('、')} 都維持原樣`,
        `這一對移到「已處理」，記為「${mode === 'confirm' ? '確認重複（未合併）' : '不是重複'}」`,
      ];

  return (
    <MuiDialog
      open
      onClose={submitting ? undefined : onClose}
      maxWidth={false}
      aria-label={title}
      slotProps={{
        paper: {
          sx: {
            width: 'min(600px, calc(100% - 48px))',
            maxHeight: '88vh',
            m: 0,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: color.bg.neutral.default,
            color: color.fg.neutral.default,
            border: 'none',
            borderRadius: `${radius.xl}px`,
            boxShadow: shadow.lg,
            overflow: 'hidden',
          },
        },
      }}
    >
      <Box data-dedup-confirm-dialog={mode} sx={{ display: 'contents' }}>
        <Box
          sx={{
            p: '18px 24px 12px',
            borderBottom: `1px solid ${color.border.default}`,
          }}
        >
          <Box sx={{ ...typography.heading[600], fontSize: 19 }}>{title}</Box>
          <Box sx={{ mt: 0.5, ...typography.body[300], ...subtle }}>{sub}</Box>
        </Box>
        <Stack
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            p: '16px 24px',
            gap: 2,
          }}
        >
          <Stack sx={{ gap: 0.75 }}>
            <Box component="span" sx={typography.label[400]}>
              送出後會發生
            </Box>
            {effects.map((line) => (
              <Box
                key={line}
                component="span"
                sx={{ ...typography.body[300], ...subtle }}
              >
                · {line}
              </Box>
            ))}
          </Stack>
          {/* DUP-BE-427 */}
          <Stack component="label" sx={{ gap: 0.75 }}>
            <Box component="span" sx={typography.label[300]}>
              備註{' '}
              <Box component="span" sx={{ ...typography.data[300], ...muted }}>
                選填，例如「已電話確認是同一戶」
              </Box>
            </Box>
            <Box
              component="textarea"
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              rows={2}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setNote(e.target.value)
              }
              data-dedup-note
              sx={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                p: '8px 10px',
                borderRadius: `${radius.sm}px`,
                border: `1px solid ${color.border.default}`,
                ...typography.body[300],
                bgcolor: color.bg.neutral.default,
              }}
            />
          </Stack>
          {problems.length ? (
            <Callout tone="danger">
              還不能送出：{problems.map((p) => p.message).join('；')}
            </Callout>
          ) : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </Stack>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: 1.25,
            p: '14px 24px',
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          <Box
            component="span"
            sx={{ flex: 1, ...typography.data[300], ...muted }}
          >
            送出後不能復原
          </Box>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            回去修改
          </Button>
          <Button
            onClick={submit}
            disabled={problems.length > 0 || submitting}
            startIcon={isMerge ? <Merge size={16} /> : <Check size={16} />}
          >
            {isMerge
              ? '確認合併，送出'
              : mode === 'confirm'
                ? '確認重複，送出'
                : '確認不是重複，送出'}
          </Button>
        </Stack>
      </Box>
    </MuiDialog>
  );
}

// ── Done (已處理) ───────────────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  merged: '合併成一張',
  confirmed: '確認重複',
  rejected: '不是重複',
  verdict_revoked: '撤銷判定',
};

function DoneDetail({
  pair,
  labels,
}: {
  pair: DuplicatePairDetail;
  labels: FieldLabels;
}) {
  const sides = orderedSides(pair);
  const outcome = outcomeOf(pair);
  const merged = pair.events.find((e) => e.event_type === 'merged');
  // WG-163: who decided what, and when. The events that say how a pair came to the queue are
  // left out: the page shows no source (DEDUP-008 decision 3).
  const decisions = pair.events.filter((e) => e.event_type in EVENT_LABELS);
  const lastNote = [...decisions].reverse().find((e) => e.decision_reason);
  // The kept ticket is the one still live after a merge (the other is cancelled, Spec 028 §3.5).
  const keptSide: Side | null = merged
    ? pair.tickets?.low && !pair.tickets.high
      ? 'low'
      : pair.tickets?.high && !pair.tickets.low
        ? 'high'
        : null
    : null;
  const station = pair.entity_kind === 'station';
  const summary =
    outcome === 'merged'
      ? keptSide
        ? `兩張任務單合成一張（${pair[keptSide].ticket_title ?? pair[keptSide].title ?? ''}）。`
        : '兩張任務單合成一張。'
      : outcome === 'confirmed'
        ? station
          ? '審核後確認這兩個站點是重複的。站點合併後端還沒做，兩個站點都維持原樣。'
          : '審核後確認這兩張單是重複的，兩張單都維持原樣。'
        : `審核後確認這兩${station ? '個站點' : '張單'}不是同一件事。這一對不會再提示，除非之後有人把它們改到相似。`;

  return (
    <Stack sx={{ gap: 2, maxWidth: 1100 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}
      >
        {outcome !== 'pending' ? (
          <Badge tone={outcome === 'separate' ? 'neutral' : 'success'}>
            {OUTCOME_LABELS[outcome]}
          </Badge>
        ) : null}
        <Box component="span" sx={{ ...typography.data[300], ...muted }}>
          {[pair.reviewed_by_name, shortTime(pair.reviewed_at)]
            .filter(Boolean)
            .join(' · ')}
        </Box>
      </Stack>
      <Box
        sx={{
          p: '12px 16px',
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          ...typography.body[400],
          color: color.fg.neutral.default,
        }}
      >
        {summary}
      </Box>
      {lastNote ? (
        <Box sx={{ ...typography.body[300], ...subtle }}>
          備註：{lastNote.decision_reason}
        </Box>
      ) : null}
      {decisions.length ? (
        <Stack sx={{ gap: 0.75 }}>
          <Box component="span" sx={typography.label[400]}>
            已寫入變更紀錄
          </Box>
          {decisions.map((event) => (
            <Box
              key={event.uuid}
              component="span"
              sx={{ ...typography.body[300], ...subtle }}
            >
              · {EVENT_LABELS[event.event_type]}（
              {[event.actor_name, shortTime(event.created_at)]
                .filter(Boolean)
                .join('，')}
              ）
            </Box>
          ))}
        </Stack>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 1,
        }}
      >
        {sides.map((side, i) => {
          const s = pair[side];
          const kept = keptSide === side;
          const gone = Boolean(merged) && keptSide != null && !kept;
          return (
            <Stack
              key={side}
              sx={{
                p: 1.5,
                gap: 0.5,
                borderRadius: `${radius.md}px`,
                border: `1px solid ${color.border.default}`,
                opacity: gone ? 0.7 : 1,
              }}
            >
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                <LetterDot index={i} on={kept} />
                {kept ? <Badge tone="success">合併後的單</Badge> : null}
                {gone ? <Badge tone="neutral">已併入</Badge> : null}
              </Stack>
              {s.deleted ? (
                // The backend sends only the uuid of a side cancelled or deleted since.
                <Box
                  component="span"
                  sx={{ ...typography.body[300], ...subtle }}
                >
                  {gone ? '內容已併入合併後的單' : '這一邊已取消或刪除'}
                </Box>
              ) : (
                <>
                  <Box component="span" sx={typography.label[400]}>
                    {s.ticket_title ?? s.title ?? '（沒有名稱）'}
                  </Box>
                  {pair.entity_kind === 'ticket_task' && s.title ? (
                    <Box
                      component="span"
                      sx={{ ...typography.body[300], ...subtle }}
                    >
                      {s.title}
                      {s.type ? ` · ${labels.taskType(s.type)}` : ''}
                    </Box>
                  ) : null}
                </>
              )}
            </Stack>
          );
        })}
      </Box>
    </Stack>
  );
}
