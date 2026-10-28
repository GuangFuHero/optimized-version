'use client';

import { Box, IconButton, Typography } from '@mui/material';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  designTokens,
  ListPagination,
  type DataTableProps,
} from '@rescue-frontend/ui';
import { ChevronDown, ChevronRight, MapPin, SearchX } from 'lucide-react';
import { useState, type ReactNode, type SyntheticEvent } from 'react';

import { FreshnessCell } from '../../../station/admin/station-management/station-cells';
import {
  formatTicketStatusLabel,
  formatTicketTypeLabel,
  getTicketPriorityBadge,
  getTicketStatusTone,
} from '../../status';
import {
  visibleTicketColumns,
  type TicketColumnId,
} from './model/ticket-columns';
import { pageOf } from './model/ticket-filters';
import {
  AUDIT_BADGES,
  OPEN_TASK_STATUSES,
  type TaskRow,
  type TicketRow,
} from './model/ticket-row';

const { color, radius, typography } = designTokens;

const PRIORITY_TEXT: Record<string, string> = { medium: '中', low: '低' };

export { AUDIT_BADGES };

interface TicketTableProps {
  rows: readonly TicketRow[];
  loading: boolean;
  truncated: boolean;
  /** The tickets did not load: an error with 重試, never 「沒有符合條件」. */
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  now: Date;
  page: number;
  onPageChange: (page: number) => void;
  onOpenTicket: (uuid: string) => void;
}

export function TicketTable({
  rows,
  loading,
  truncated,
  failed,
  retrying,
  onRetry,
  now,
  page,
  onPageChange,
  onOpenTicket,
}: TicketTableProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = (uuid: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  const paged = pageOf(rows, page);

  const renderCell = (id: TicketColumnId, row: TicketRow): ReactNode => {
    switch (id) {
      case 'expand':
        // No tasks, no toggle: an empty cell keeps the column's width, and a click there opens
        // the row as anywhere else on it does.
        return row.tasks.length > 0 ? (
          <ExpandToggle
            expanded={expandedIds.has(row.uuid)}
            onToggle={() => toggle(row.uuid)}
          />
        ) : null;
      case 'priority':
        return <PriorityCell priority={row.priority} />;
      case 'title':
        return (
          <Typography
            noWrap
            title={row.title}
            sx={{ ...typography.label[400], color: color.fg.neutral.default }}
          >
            {row.title}
          </Typography>
        );
      case 'area':
        return <AreaCell area={row.area} />;
      case 'status':
        return (
          <Badge tone={getTicketStatusTone(row.status)}>
            {formatTicketStatusLabel(row.status)}
          </Badge>
        );
      case 'needs': {
        const open = row.tasks.filter((t) =>
          OPEN_TASK_STATUSES.has(t.status),
        ).length;
        return <Muted>{`${open}/${row.tasks.length} 項`}</Muted>;
      }
      case 'gap':
        return row.volunteerGap > 0 ? (
          <Typography
            noWrap
            sx={{ ...typography.label[300], color: color.fg.warning }}
          >
            缺 {row.volunteerGap} 人
          </Typography>
        ) : (
          <Muted>—</Muted>
        );
      case 'audit': {
        const audit = AUDIT_BADGES[row.auditStatus];
        return audit ? <Badge tone={audit.tone}>{audit.label}</Badge> : null;
      }
      case 'updated':
        return <FreshnessCell updatedAt={row.updatedAt} now={now} />;
      case 'open':
        return (
          <ChevronRight
            size={18}
            color={color.fg.neutral.muted}
            style={{ display: 'block' }}
          />
        );
    }
  };

  const columns: DataTableProps<TicketRow>['columns'] =
    visibleTicketColumns().map((column) => ({
      id: column.id,
      header: column.label,
      meta: { width: column.width },
      cell: ({ row }) => renderCell(column.id, row.original),
    }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {failed ? (
        <Callout tone="danger">
          無法載入求助單，請稍後再試
          <Button
            variant="ghost"
            size="sm"
            disabled={retrying}
            onClick={onRetry}
          >
            重試
          </Button>
        </Callout>
      ) : null}
      {truncated ? (
        <Callout tone="warning">
          只載入前 5,000 張求助單，請用篩選縮小範圍。
        </Callout>
      ) : null}
      <DataTable
        columns={columns}
        data={paged.items}
        getRowId={(row) => row.uuid}
        onRowClick={(row) => onOpenTicket(row.uuid)}
        renderExpanded={(row) => <TaskLines tasks={row.tasks} />}
        expandedRowIds={expandedIds}
        density="compact"
        minWidth={1080}
        empty={
          <Box
            sx={{ p: loading || failed ? 4 : '64px 24px', textAlign: 'center' }}
          >
            {loading ? (
              <Muted>載入中…</Muted>
            ) : failed ? (
              <Muted>—</Muted>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <SearchX size={38} color={color.fg.neutral.muted} />
                <Typography
                  sx={{
                    ...typography.heading[600],
                    color: color.fg.neutral.subtle,
                  }}
                >
                  沒有符合條件的求助單
                </Typography>
              </Box>
            )}
          </Box>
        }
      />
      {paged.pageCount > 1 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <ListPagination
            showPageNumbers
            page={paged.page}
            pageCount={paged.pageCount}
            onPageChange={onPageChange}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/** Toggles the row's tasks; its clicks and Enter stay in the cell so the row does not open. */
function ExpandToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <IconButton
      size="small"
      aria-label={expanded ? '收合需求' : '展開需求'}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={stop}
      sx={{ p: '4px', borderRadius: `${radius.sm}px` }}
    >
      <Icon size={16} color={color.fg.neutral.subtle} />
    </IconButton>
  );
}

function PriorityCell({ priority }: { priority: string }) {
  const badge = getTicketPriorityBadge(priority);
  if (badge) {
    return (
      <Badge tone={badge.tone} variant={badge.variant}>
        {badge.label}
      </Badge>
    );
  }
  return <Muted>{PRIORITY_TEXT[priority] ?? '—'}</Muted>;
}

function AreaCell({ area }: { area: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        minWidth: 0,
      }}
    >
      <MapPin
        size={14}
        color={color.fg.neutral.muted}
        style={{ flexShrink: 0 }}
      />
      <Typography
        noWrap
        sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
      >
        {area || '—'}
      </Typography>
    </Box>
  );
}

/** The expanded block: one line per need, under the ticket's title. */
function TaskLines({ tasks }: { tasks: readonly TaskRow[] }) {
  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        m: 0,
        ml: '44px',
        p: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      {tasks.map((task) => (
        <Box
          component="li"
          key={task.uuid}
          sx={{
            display: 'grid',
            gridTemplateColumns: '56px minmax(0, 1fr) 96px 80px',
            columnGap: '12px',
            alignItems: 'center',
          }}
        >
          <Muted>{formatTicketTypeLabel(task.taskType)}</Muted>
          <Typography
            noWrap
            title={task.taskName}
            sx={{ ...typography.body[300], color: color.fg.neutral.default }}
          >
            {task.taskName}
          </Typography>
          <Muted>{formatTicketStatusLabel(task.status)}</Muted>
          <Muted>{`${task.assignedCount}/${task.quantity ?? '—'} 人`}</Muted>
        </Box>
      ))}
    </Box>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography
      noWrap
      sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
    >
      {children}
    </Typography>
  );
}
