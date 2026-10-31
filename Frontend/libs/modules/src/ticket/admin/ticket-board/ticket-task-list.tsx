'use client';

import { Box, ButtonBase, Menu, MenuItem, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateTicketWrite,
  useAssignTaskActor,
  useCurrentUser,
  useDeleteTicketTask,
  useStopTaskRecruiting,
  useTeamMembers,
  useUnassignTaskActor,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  designTokens,
  Dialog,
  displayTextSize,
} from '@rescue-frontend/ui';
import { ChevronDown, Circle, User, UserPlus, X } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { Muted } from '../../../admin/shared/muted';
import { useBusyKeys, useReportBusy } from './hooks/use-busy-keys';
import { NEED_KIND_ICONS } from './need-kind-icons';
import {
  assignErrorMessage,
  deleteNeedErrorMessage,
  isAssignmentAlreadyGone,
  isNeedAlreadyGone,
  stopRecruitingErrorMessage,
  unassignErrorMessage,
  type ClaimError,
} from '../../needs/claim-error';
import { describeNeedDeletion } from '../../needs/delete-need';
import type { NeedAction } from '../../needs/need-actions';
import { AddNeedForm } from './add-need-form';
import { ProgressNote } from './progress-note';
import {
  assignPickerOptions,
  canAddNeed,
  canAssignNeed,
  canRemoveAssignee,
  canWriteNeedNote,
  needKindLine,
  needStatusLabel,
  needTakenLine,
} from './model/need-assign';
import { isForbidden, taskActionsFor } from './model/task-actions';
import type { DetailTicket } from './model/ticket-detail-view';
import {
  toTaskRows,
  type TaskRow,
  type TicketStatus,
} from './model/ticket-row';

const { color, focusRing, radius, shadow, typography } = designTokens;

type DetailTask = DetailTicket['tasks'][number];
type DetailAssignment = DetailTask['assignments'][number];

const ASSIGNMENT_LABELS: Record<string, string> = {
  accepted: '已接單',
  en_route: '前往中',
  completed: '已完成',
};

/** The caller's team, whose members 指派承接 offers; null when the identity has none. */
interface PickerTeam {
  uuid: string;
  name: string;
  /** `team.member.view`: the roster may be listed at all. */
  canList: boolean;
}

interface TicketTaskListProps {
  ticket: DetailTicket;
  /**
   * A write here is in flight (or none is): 再加一項需求, 指派承接, removing someone, 進度備註,
   * 停止招募 or 刪除需求. The drawer holds its close meanwhile.
   */
  onBusyChange?(busy: boolean): void;
}

type PendingAction =
  | { kind: 'stop' | 'delete'; task: TaskRow }
  | { kind: 'unassign'; task: TaskRow; assignment: DetailAssignment };

/**
 * 需求與承接: each need as a card, after the prototype's `TaskBlock`. Its status dropdown shows
 * where it stands and offers only what the backend lets the identity do to it (`taskActionsFor`:
 * 停止招募, 刪除需求), never a status to set (BE-034); each behind a confirmation. Where the need's
 * `viewerCanAssign` allows and it has room, 指派承接 adds a member of the caller's team; a place's
 * `viewerCanUnassign` offers × to take that person off. `ticket.edit` on the ticket adds 再加一項需求
 * below them unless it is cancelled (`canAddNeed`), and writes each need's 進度備註 when the ticket
 * isn't coarse (`canWriteNeedNote`).
 */
export function TicketTaskList({ ticket, onBusyChange }: TicketTaskListProps) {
  const busyFor = useBusyKeys(onBusyChange);
  // One task model for the board, read off the drawer's ticket as off a list row.
  const rows = useMemo(() => toTaskRows(ticket.tasks), [ticket.tasks]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const user = useCurrentUser().data;
  const identity = user?.active_identity;
  const team: PickerTeam | null = identity?.team_uuid
    ? {
        uuid: identity.team_uuid,
        name: identity.team ?? '你的單位',
        canList: user?.capabilities.includes('team.member.view') ?? false,
      }
    : null;

  const request = (action: PendingAction) => {
    setPending(action);
    setDialogOpen(true);
  };

  return (
    <>
      {ticket.tasks.length === 0 ? (
        <Muted inline>尚無需求 · 待現場勘查後補列</Muted>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ticket.tasks.map((task, index) => {
            const row = rows[index];
            const items: NeedAction[] = taskActionsFor(
              row,
              // The schema types it as a plain string; the backend stores only the listed values.
              ticket.status as TicketStatus,
              ticket,
            ).map((action) =>
              action === 'stop'
                ? {
                    label: '停止招募',
                    onSelect: () => request({ kind: 'stop', task: row }),
                  }
                : {
                    label: '刪除需求',
                    tone: 'danger',
                    onSelect: () => request({ kind: 'delete', task: row }),
                  },
            );
            return (
              <TaskCard
                key={task.uuid}
                ticketUuid={ticket.uuid}
                task={task}
                canAssign={canAssignNeed(task, ticket.status, {
                  hasTeam: team !== null,
                })}
                team={team}
                assignmentsHidden={!ticket.viewerCanViewHistory}
                canEditNote={canWriteNeedNote(ticket)}
                statusMenu={
                  <NeedStatusMenu
                    needName={task.taskName}
                    status={task.status}
                    items={items}
                  />
                }
                onRemove={(assignment) =>
                  request({ kind: 'unassign', task: row, assignment })
                }
                onAssignBusyChange={busyFor(`assign:${task.uuid}`)}
                onNoteBusyChange={busyFor(`note:${task.uuid}`)}
              />
            );
          })}
        </Box>
      )}
      {canAddNeed(ticket) ? (
        <AddNeedForm ticketUuid={ticket.uuid} onBusyChange={busyFor('add')} />
      ) : null}
      <StopRecruitingConfirm
        open={dialogOpen && pending?.kind === 'stop'}
        ticketUuid={ticket.uuid}
        task={pending?.kind === 'stop' ? pending.task : null}
        onClose={() => setDialogOpen(false)}
        onBusyChange={busyFor('stop')}
      />
      <DeleteNeedConfirm
        open={dialogOpen && pending?.kind === 'delete'}
        ticketUuid={ticket.uuid}
        task={pending?.kind === 'delete' ? pending.task : null}
        needs={rows}
        onClose={() => setDialogOpen(false)}
        onBusyChange={busyFor('delete')}
      />
      <UnassignConfirm
        open={dialogOpen && pending?.kind === 'unassign'}
        ticketUuid={ticket.uuid}
        task={pending?.kind === 'unassign' ? pending.task : null}
        assignment={pending?.kind === 'unassign' ? pending.assignment : null}
        onClose={() => setDialogOpen(false)}
        onBusyChange={busyFor('unassign')}
      />
    </>
  );
}

interface ConfirmProps {
  open: boolean;
  /** The need's ticket, whose loads a refusal makes stale. */
  ticketUuid: string;
  /** Kept while the dialog fades out, so it keeps its content. */
  task: TaskRow | null;
  onClose: () => void;
  /** The write is in flight (or not): the drawer holds its close meanwhile. */
  onBusyChange?: (busy: boolean) => void;
}

/** 停止招募: the need's list is fixed at the people on it. `Dialog` refuses to close mid-request. */
function StopRecruitingConfirm({
  open,
  ticketUuid,
  task,
  onClose,
  onBusyChange,
}: ConfirmProps) {
  const stop = useStopTaskRecruiting();
  useReportBusy(stop.isPending, onBusyChange);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!task || stop.isPending) return;
    setError(null);
    try {
      await stop.mutateAsync({ taskUuid: task.uuid });
      onClose();
    } catch (caught) {
      // A refusal usually means the need changed meanwhile: read the ticket again.
      void invalidateTicketWrite(queryClient, ticketUuid);
      setError(stopRecruitingErrorMessage(caught as ClaimError));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      onExited={() => setError(null)}
      title="停止招募這筆需求？"
      confirmLabel={stop.isPending ? '停止中…' : '停止招募'}
      error={error}
      submitting={stop.isPending}
    >
      {task ? (
        <DialogText>
          {`「${task.taskName}」停止後不再接受新的承接，名額固定為目前的 ${task.assignedCount} 人。已承接的志工會收到通知、照常前往。這個動作無法復原。`}
        </DialogText>
      ) : null}
    </Dialog>
  );
}

/** 刪除需求, with the site's own explanation of what deleting it does. */
function DeleteNeedConfirm({
  open,
  ticketUuid,
  task,
  needs,
  onClose,
  onBusyChange,
}: ConfirmProps & { needs: TaskRow[] }) {
  const remove = useDeleteTicketTask();
  useReportBusy(remove.isPending, onBusyChange);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!task || remove.isPending) return;
    setError(null);
    try {
      await remove.mutateAsync({ uuid: task.uuid });
      onClose();
    } catch (caught) {
      const refusal = caught as ClaimError;
      // Gone already, from another tab or with its ticket, is what was asked for.
      if (isNeedAlreadyGone(refusal)) {
        void invalidateTicketWrite(queryClient, ticketUuid);
        onClose();
        return;
      }
      setError(
        isForbidden(refusal)
          ? '你的帳號沒有刪除需求的權限。'
          : deleteNeedErrorMessage(refusal),
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      onExited={() => setError(null)}
      title="刪除這筆需求？"
      confirmLabel={remove.isPending ? '刪除中…' : '刪除'}
      confirmTone="danger"
      error={error}
      submitting={remove.isPending}
    >
      {task ? (
        <DialogText>
          {`「${task.taskName}」${describeNeedDeletion(task, needs)}`}
        </DialogText>
      ) : null}
    </Dialog>
  );
}

function DialogText({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        ...typography.body[300],
        color: color.fg.neutral.muted,
        lineHeight: 1.6,
      }}
    >
      {children}
    </Typography>
  );
}

/** Take one person off a need. The backend tells them, so the dialog says so. */
function UnassignConfirm({
  open,
  ticketUuid,
  task,
  assignment,
  onClose,
  onBusyChange,
}: ConfirmProps & { assignment: DetailAssignment | null }) {
  const unassign = useUnassignTaskActor();
  useReportBusy(unassign.isPending, onBusyChange);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!assignment || unassign.isPending) return;
    setError(null);
    try {
      await unassign.mutateAsync({ uuid: assignment.uuid });
      onClose();
    } catch (caught) {
      const refusal = caught as ClaimError;
      // The need changed meanwhile, or the place is gone already: read the ticket again.
      void invalidateTicketWrite(queryClient, ticketUuid);
      if (isAssignmentAlreadyGone(refusal)) {
        onClose();
        return;
      }
      setError(unassignErrorMessage(refusal));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      onExited={() => setError(null)}
      title="移除這位承接者？"
      confirmLabel={unassign.isPending ? '移除中…' : '移除'}
      confirmTone="danger"
      error={error}
      submitting={unassign.isPending}
    >
      {task && assignment ? (
        <DialogText>
          {`「${assignment.actorName ?? '這位志工'}」將從「${task.taskName}」的承接名單移除，對方會收到通知。名額會空出來，可以再指派其他人。`}
        </DialogText>
      ) : null}
    </Dialog>
  );
}

/**
 * The need's status as a dropdown (prototype `PlainSelect`): it reads the current status, and its
 * menu holds only the actions allowed. With none, the status shows as plain words, not a control
 * that opens onto nothing.
 */
function NeedStatusMenu({
  needName,
  status,
  items,
}: {
  needName: string;
  status: string;
  items: NeedAction[];
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const label = needStatusLabel(status);
  const box = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: 32,
    minWidth: 96,
    px: '10px',
    boxSizing: 'border-box',
    borderRadius: `${radius.md}px`,
    ...typography.data[300],
    color: color.fg.neutral.default,
  } as const;

  if (items.length === 0) {
    return (
      <Box component="span" sx={{ ...box, justifyContent: 'flex-end' }}>
        {label}
      </Box>
    );
  }

  return (
    <>
      <ButtonBase
        aria-label={`需求狀態：${label}，${needName} 的動作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          ...box,
          justifyContent: 'space-between',
          bgcolor: color.bg.neutral.subtle,
          boxShadow: `inset 0 0 0 1px ${color.border.default}`,
          '&:hover': { bgcolor: color.bg.neutral.sunken },
        }}
      >
        {label}
        <ChevronDown size={14} color={color.fg.neutral.muted} />
      </ButtonBase>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 160,
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              backgroundImage: 'none',
              boxShadow: shadow.lg,
            },
          },
        }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              setAnchorEl(null);
              item.onSelect();
            }}
            sx={{
              minHeight: 40,
              fontSize: displayTextSize[14],
              color:
                item.tone === 'danger'
                  ? color.fg.danger
                  : color.fg.neutral.default,
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function TaskCard({
  ticketUuid,
  task,
  canAssign,
  team,
  assignmentsHidden,
  canEditNote,
  statusMenu,
  onRemove,
  onAssignBusyChange,
  onNoteBusyChange,
}: {
  ticketUuid: string;
  task: DetailTask;
  /** 指派承接 is offered: `canAssignNeed`. */
  canAssign: boolean;
  team: PickerTeam | null;
  /** No ticket.view_history here: `assignments` arrives empty though `assignedCount` is public. */
  assignmentsHidden: boolean;
  /** `ticket.edit` on the ticket: its 進度備註 may be written. */
  canEditNote: boolean;
  statusMenu: ReactNode;
  onRemove: (assignment: DetailAssignment) => void;
  /** 指派承接 is sending (or not). */
  onAssignBusyChange: (busy: boolean) => void;
  /** 進度備註 is saving (or not). */
  onNoteBusyChange: (busy: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const KindIcon = NEED_KIND_ICONS[task.taskType] ?? Circle;
  const caption = { ...typography.body[300], color: color.fg.neutral.muted };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '12px',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.md}px`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <KindIcon size={16} color={color.fg.neutral.muted} />
        <Typography
          component="span"
          sx={{
            ...typography.label[400],
            color: color.fg.neutral.default,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {task.taskName}
        </Typography>
        <Typography
          component="span"
          sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
        >
          {needKindLine(task)}
        </Typography>
        <Box sx={{ ml: 'auto' }}>{statusMenu}</Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <Typography component="span" sx={caption}>
          {needTakenLine(task)}
        </Typography>
        {task.recruitingStoppedAt ? (
          <Badge tone="warning" size="sm">
            已停止招募
          </Badge>
        ) : null}
        {assignmentsHidden && task.assignedCount > 0 ? (
          <Typography component="span" sx={caption}>
            承接的志工：無權限檢視
          </Typography>
        ) : task.assignments.length === 0 ? (
          <Typography component="span" sx={caption}>
            尚無人承接
          </Typography>
        ) : (
          task.assignments.map((assignment) => (
            <AssigneeChip
              key={assignment.uuid}
              assignment={assignment}
              onRemove={
                canRemoveAssignee(task, assignment)
                  ? () => onRemove(assignment)
                  : undefined
              }
            />
          ))
        )}
        {canAssign && !adding ? (
          <ButtonBase
            onClick={() => setAdding(true)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: 24,
              px: '10px',
              borderRadius: `${radius.full}px`,
              border: `1px dashed ${color.border.default}`,
              ...typography.data[300],
              color: color.brand.secondary.default,
            }}
          >
            <UserPlus size={12} />
            指派承接
          </ButtonBase>
        ) : null}
      </Box>
      {canAssign && adding ? (
        <AssignPicker
          ticketUuid={ticketUuid}
          task={task}
          team={team}
          onDone={() => setAdding(false)}
          onBusyChange={onAssignBusyChange}
        />
      ) : null}
      <ProgressNote
        taskUuid={task.uuid}
        note={task.progressNote ?? null}
        canEdit={canEditNote}
        onBusyChange={onNoteBusyChange}
      />
    </Box>
  );
}

/** One person on the need: their name, how far they are, and × where they may be taken off. */
function AssigneeChip({
  assignment,
  onRemove,
}: {
  assignment: DetailAssignment;
  onRemove?: () => void;
}) {
  const name = assignment.actorName ?? '志工';
  const progress = ASSIGNMENT_LABELS[assignment.status ?? ''];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: 24,
        pl: '10px',
        pr: onRemove ? '4px' : '10px',
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.subtle,
        ...typography.data[300],
        color: color.fg.neutral.subtle,
      }}
    >
      <User size={12} color={color.fg.neutral.muted} />
      {name}
      {progress ? (
        <Box component="span" sx={{ color: color.fg.neutral.muted }}>
          {progress}
        </Box>
      ) : null}
      {onRemove ? (
        <ButtonBase
          aria-label={`移除承接者：${name}`}
          onClick={onRemove}
          sx={{
            width: 18,
            height: 18,
            borderRadius: `${radius.full}px`,
            color: color.fg.neutral.muted,
            '&:hover': {
              bgcolor: color.bg.neutral.sunken,
              color: color.fg.neutral.default,
            },
          }}
        >
          <X size={12} />
        </ButtonBase>
      ) : null}
    </Box>
  );
}

/**
 * 指派承接, in place (no dialog): a member of the caller's team, then 加入. One pick is one person;
 * the backend turns away a need already full, or someone already on it.
 */
function AssignPicker({
  ticketUuid,
  task,
  team,
  onDone,
  onBusyChange,
}: {
  ticketUuid: string;
  task: DetailTask;
  team: PickerTeam | null;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const selectId = useId();
  const members = useTeamMembers(team?.uuid, {
    enabled: Boolean(team?.canList),
  });
  const assign = useAssignTaskActor();
  useReportBusy(assign.isPending, onBusyChange);
  const queryClient = useQueryClient();
  const options = useMemo(
    () => assignPickerOptions(members.data ?? [], task.assignments),
    [members.data, task.assignments],
  );
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pick = options.some((o) => o.value === picked)
    ? picked
    : (options[0]?.value ?? '');

  const confirm = async () => {
    if (!pick || assign.isPending) return;
    setError(null);
    try {
      await assign.mutateAsync({ taskUuid: task.uuid, actorUuid: pick });
      onDone();
    } catch (caught) {
      // Filled or closed meanwhile, most likely: read the ticket again.
      void invalidateTicketWrite(queryClient, ticketUuid);
      setError(assignErrorMessage(caught as ClaimError));
    }
  };

  let blocker: string | null = null;
  if (!team) blocker = '你目前的身分不屬於任何單位，沒有可指派的成員。';
  else if (!team.canList) blocker = '你的帳號無法檢視單位成員名單。';
  else if (members.isPending) blocker = '載入成員中…';
  else if (members.error) blocker = '成員名單載入失敗，請稍後再試。';
  else if (options.length === 0) {
    blocker = members.data?.length
      ? `${team.name} 已全數在這筆需求上`
      : `${team.name} 沒有成員`;
  }

  const cancel = (
    <Button
      variant="ghost"
      size="sm"
      onClick={onDone}
      disabled={assign.isPending}
    >
      取消
    </Button>
  );

  if (blocker) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <Muted inline>{blocker}</Muted>
        {cancel}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <Box
          component="label"
          htmlFor={selectId}
          sx={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          {`指派「${task.taskName}」給 ${team?.name ?? ''} 的成員`}
        </Box>
        <Box
          component="select"
          id={selectId}
          value={pick}
          disabled={assign.isPending}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
            setPicked(event.target.value)
          }
          sx={{
            height: 32,
            width: 200,
            maxWidth: '100%',
            px: '10px',
            border: 'none',
            outline: 'none',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.neutral.subtle,
            boxShadow: `inset 0 0 0 1px ${color.border.default}`,
            ...typography.data[300],
            color: color.fg.neutral.default,
            '&:focus-visible': {
              outline: `${focusRing.width}px solid ${focusRing.color}`,
              outlineOffset: `${focusRing.offset}px`,
            },
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Box>
        <Button
          size="sm"
          onClick={() => void confirm()}
          disabled={!pick || assign.isPending}
        >
          {assign.isPending ? '加入中…' : '加入'}
        </Button>
        {cancel}
      </Box>
      <Typography
        sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
      >
        一人承接即一人，要多人就分別加入。被指派的成員會收到通知。
      </Typography>
      {error ? (
        <Typography
          role="alert"
          sx={{ ...typography.body[300], color: color.fg.danger }}
        >
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}
