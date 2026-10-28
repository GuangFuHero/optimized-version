'use client';

import { Box, Typography } from '@mui/material';
import { Badge, designTokens } from '@rescue-frontend/ui';
import type { ReactNode } from 'react';

import {
  formatTicketStatusLabel,
  formatTicketTypeLabel,
  getTicketStatusTone,
} from '../../status';
import type { TicketCapabilities } from './hooks/use-ticket-capabilities';
import type { DetailTicket } from './model/ticket-detail-view';

const { color, radius, typography } = designTokens;

type DetailTask = DetailTicket['tasks'][number];

const ASSIGNMENT_LABELS: Record<string, string> = {
  accepted: '已接單',
  en_route: '前往中',
  completed: '已完成',
};

interface TicketTaskListProps {
  ticket: DetailTicket;
  /** Unused until the per-need actions arrive (stop recruiting, delete, add a need). */
  caps: TicketCapabilities;
}

/** The ticket's needs and who took them, read-only. */
export function TicketTaskList({ ticket }: TicketTaskListProps) {
  if (ticket.tasks.length === 0) {
    return <Muted>（尚無需求）</Muted>;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {ticket.tasks.map((task) => (
        // `actions`: the slot for a need's actions (stop recruiting, delete), none yet.
        <TaskCard key={task.uuid} task={task} />
      ))}
    </Box>
  );
}

function TaskCard({
  task,
  actions = null,
}: {
  task: DetailTask;
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
        <Muted>{`${task.assignedCount}/${task.quantity ?? '—'} 人`}</Muted>
        {task.recruitingStoppedAt ? (
          <Badge tone="warning" size="sm">
            已停止招募
          </Badge>
        ) : null}
      </Box>
      {task.assignments.length ? (
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
              <Muted>
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

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
    >
      {children}
    </Typography>
  );
}
