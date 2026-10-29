'use client';

import { Box, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateTicketWrite,
  useDeleteTicketTask,
  useStopTaskRecruiting,
} from '@rescue-frontend/data-access/admin';
import { Badge, designTokens, Dialog } from '@rescue-frontend/ui';
import { useMemo, useState, type ReactNode } from 'react';

import { Muted } from '../../../admin/shared/muted';
import {
  deleteNeedErrorMessage,
  isNeedAlreadyGone,
  stopRecruitingErrorMessage,
  type ClaimError,
} from '../../needs/claim-error';
import { describeNeedDeletion } from '../../needs/delete-need';
import { NeedActionsMenu } from '../../needs/need-actions-menu';
import type { NeedAction } from '../../needs/need-actions';
import {
  formatTicketStatusLabel,
  formatTicketTypeLabel,
  getTicketStatusTone,
} from '../../status';
import { AddNeedForm } from './add-need-form';
import { isForbidden, taskActionsFor } from './model/task-actions';
import type { DetailTicket } from './model/ticket-detail-view';
import {
  toTaskRows,
  type TaskRow,
  type TicketStatus,
} from './model/ticket-row';

const { color, radius, typography } = designTokens;

type DetailTask = DetailTicket['tasks'][number];

const ASSIGNMENT_LABELS: Record<string, string> = {
  accepted: '已接單',
  en_route: '前往中',
  completed: '已完成',
};

interface TicketTaskListProps {
  ticket: DetailTicket;
  /** 再加一項需求 is sending (or not): the drawer holds its close meanwhile. */
  onAddBusyChange?(busy: boolean): void;
}

type PendingAction = { kind: 'stop' | 'delete'; task: TaskRow };

/**
 * The ticket's needs and who took them. Each need's ⋯ offers what the identity may do to it
 * (`taskActionsFor`), each behind a confirmation; `ticket.edit` on the ticket adds 再加一項需求 below them.
 */
export function TicketTaskList({
  ticket,
  onAddBusyChange,
}: TicketTaskListProps) {
  // One task model for the board, read off the drawer's ticket as off a list row.
  const rows = useMemo(() => toTaskRows(ticket.tasks), [ticket.tasks]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const request = (kind: PendingAction['kind'], task: TaskRow) => {
    setPending({ kind, task });
    setDialogOpen(true);
  };

  return (
    <>
      {ticket.tasks.length === 0 ? (
        <Muted inline>（尚無需求）</Muted>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ticket.tasks.map((task, index) => {
            const row = rows[index];
            const items: NeedAction[] = taskActionsFor(
              row,
              // The schema types it as a plain string; the backend stores only the listed values.
              ticket.status as TicketStatus,
              ticket,
            ).map((action) =>
              action === 'stop'
                ? { label: '停止招募', onSelect: () => request('stop', row) }
                : {
                    label: '刪除需求',
                    tone: 'danger',
                    onSelect: () => request('delete', row),
                  },
            );
            return (
              <TaskCard
                key={task.uuid}
                task={task}
                assignmentsHidden={!ticket.viewerCanViewHistory}
                actions={
                  <NeedActionsMenu
                    needName={task.taskName}
                    items={items}
                    sx={{ my: '-8px' }}
                  />
                }
              />
            );
          })}
        </Box>
      )}
      {ticket.viewerCanEdit ? (
        <AddNeedForm ticketUuid={ticket.uuid} onBusyChange={onAddBusyChange} />
      ) : null}
      <StopRecruitingConfirm
        open={dialogOpen && pending?.kind === 'stop'}
        ticketUuid={ticket.uuid}
        task={pending?.kind === 'stop' ? pending.task : null}
        onClose={() => setDialogOpen(false)}
      />
      <DeleteNeedConfirm
        open={dialogOpen && pending?.kind === 'delete'}
        ticketUuid={ticket.uuid}
        task={pending?.kind === 'delete' ? pending.task : null}
        needs={rows}
        onClose={() => setDialogOpen(false)}
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
}

/** 停止招募: the need's list is fixed at the people on it. `Dialog` refuses to close mid-request. */
function StopRecruitingConfirm({
  open,
  ticketUuid,
  task,
  onClose,
}: ConfirmProps) {
  const stop = useStopTaskRecruiting();
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
}: ConfirmProps & { needs: TaskRow[] }) {
  const remove = useDeleteTicketTask();
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

function TaskCard({
  task,
  assignmentsHidden,
  actions = null,
}: {
  task: DetailTask;
  /** No ticket.view_history here: `assignments` arrives empty though `assignedCount` is public. */
  assignmentsHidden: boolean;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
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
          gap: '8px',
        }}
      >
        <Badge>{formatTicketTypeLabel(task.taskType)}</Badge>
        <Typography
          component="span"
          sx={{
            ...typography.body[400],
            color: color.fg.neutral.default,
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {task.taskName}
        </Typography>
        <Badge tone={getTicketStatusTone(task.status)}>
          {formatTicketStatusLabel(task.status)}
        </Badge>
        {actions}
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          mt: '6px',
        }}
      >
        <Muted
          inline
        >{`${task.assignedCount}/${task.quantity ?? '—'} 人`}</Muted>
        {task.recruitingStoppedAt ? (
          <Badge tone="warning" size="sm">
            已停止招募
          </Badge>
        ) : null}
      </Box>
      {assignmentsHidden && task.assignedCount > 0 ? (
        <Box sx={{ mt: '8px' }}>
          <Muted inline>承接的志工：無權限檢視</Muted>
        </Box>
      ) : task.assignments.length ? (
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            mt: '8px',
            p: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {task.assignments.map((assignment) => (
            <Box
              component="li"
              key={assignment.uuid}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                ...typography.body[300],
                color: color.fg.neutral.default,
              }}
            >
              <span>{assignment.actorName ?? '志工'}</span>
              <Muted inline>
                {ASSIGNMENT_LABELS[assignment.status ?? ''] ??
                  assignment.status ??
                  '—'}
              </Muted>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
