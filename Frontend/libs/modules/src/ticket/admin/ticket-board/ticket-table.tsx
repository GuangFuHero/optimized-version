'use client';

import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  designTokens,
  EmptyState,
  ListPagination,
  type DataTableProps,
} from '@rescue-frontend/ui';
import {
  CircleDashed,
  ClipboardList,
  Image as ImageIcon,
  Plus,
  SearchX,
} from 'lucide-react';
import type { ReactNode, SyntheticEvent } from 'react';

import { FreshnessCell } from '../../../admin/shared/freshness-cell';
import { Muted } from '../../../admin/shared/muted';
import { NeedActionsMenu } from '../../needs/need-actions-menu';
import type { NeedAction } from '../../needs/need-actions';
import { formatTicketStatusLabel } from '../../status';
import {
  visibleTicketColumns,
  type TicketColumnId,
} from './model/ticket-columns';
import { ticketPriorityLabel } from './model/ticket-detail-view';
import { adminTicketPriorityBadge } from './model/ticket-priority';
import {
  needChipLabel,
  needProgress,
  type TaskRow,
  type TicketRow,
} from './model/ticket-row';

const { color, radius, typography } = designTokens;

/** Needs shown as chips before the rest fold into +N; the whole list is on hover. */
const CHIP_LIMIT = 3;

interface TicketTableProps {
  /** The page on view, as the server cut it. */
  rows: readonly TicketRow[];
  loading: boolean;
  /** The tickets did not load: an error with 重試, never 「沒有符合條件」. */
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  /**
   * The list asks for every ticket (no filter, no keyword): empty, it says there are none yet
   * rather than that none match.
   */
  unfiltered: boolean;
  now: Date;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onOpenTicket: (uuid: string) => void;
  /** 編輯任務單 from a row's ⋯; offered only where the ticket's `viewerCanEdit` allows. */
  onEditTicket: (uuid: string) => void;
  /** 刪除任務單 from a row's ⋯; offered only where the ticket's `viewerCanDelete` allows. */
  onDeleteTicket: (row: TicketRow) => void;
  /** 新增任務 in the empty board; unset when the viewer may not add. */
  onCreate?: () => void;
}

export function TicketTable({
  rows,
  loading,
  failed,
  retrying,
  onRetry,
  unfiltered,
  now,
  page,
  pageCount,
  onPageChange,
  onOpenTicket,
  onEditTicket,
  onDeleteTicket,
  onCreate,
}: TicketTableProps) {
  const renderCell = (id: TicketColumnId, row: TicketRow): ReactNode => {
    switch (id) {
      case 'priority':
        return <PriorityCell priority={row.priority} />;
      case 'ticket':
        return <TicketCell row={row} />;
      case 'needs':
        return <NeedsCell tasks={row.tasks} />;
      case 'updated':
        return <FreshnessCell updatedAt={row.updatedAt} now={now} />;
      case 'status':
        return <StatusCell status={row.status} />;
      case 'team':
        return <TeamCell row={row} />;
      case 'menu':
        return (
          <RowMenu
            row={row}
            onOpen={() => onOpenTicket(row.uuid)}
            onEdit={() => onEditTicket(row.uuid)}
            onDelete={() => onDeleteTicket(row)}
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
          無法載入任務單，請稍後再試
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
      {/* No minWidth: the table never scrolls sideways (TM-FS-102); its cells cut instead. */}
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.uuid}
        onRowClick={(row) => onOpenTicket(row.uuid)}
        empty={
          loading || failed ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Muted cell>{loading ? '載入中…' : '—'}</Muted>
            </Box>
          ) : unfiltered ? (
            <EmptyState
              icon={<ClipboardList />}
              title="還沒有任何任務單"
              description="民眾在前台報案，或後台人員按「新增任務」代為登錄後，任務單會出現在這裡。"
              action={
                onCreate ? (
                  <Button
                    size="sm"
                    startIcon={<Plus size={15} />}
                    onClick={onCreate}
                  >
                    新增任務
                  </Button>
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon={<SearchX />}
              title="沒有符合條件的任務單"
              description="調整篩選或搜尋關鍵字再試。"
            />
          )
        }
      />
      {pageCount > 1 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <ListPagination
            showPageNumbers
            page={page}
            pageCount={pageCount}
            onPageChange={onPageChange}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/** One line of muted text, cut, with the whole on hover. */
function CutText({
  children,
  title,
  sx,
}: {
  children: ReactNode;
  title: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      noWrap
      title={title}
      sx={[
        { ...typography.body[300], color: color.fg.neutral.muted },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

/** 生命危急 solid red, 緊急 subtle warning; 一般 and 低 as plain muted words (prototype PriorityBadge). */
function PriorityCell({ priority }: { priority: string }) {
  const badge = adminTicketPriorityBadge(priority);
  if (badge) {
    return (
      <Badge tone={badge.tone} variant={badge.variant}>
        {badge.label}
      </Badge>
    );
  }
  return (
    <Typography
      noWrap
      sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
    >
      {ticketPriorityLabel(priority)}
    </Typography>
  );
}

/** 任務: the photo count (never the images), the title, and the street line under it. */
function TicketCell({ row }: { row: TicketRow }) {
  const address = row.isCoarse
    ? '約略位置（無檢視詳細位置權限）'
    : (row.address ?? '未提供地址');
  return (
    <Box sx={{ minWidth: 0 }}>
      {row.photoCount > 0 ? (
        <Box
          component="span"
          title={`這張單有 ${row.photoCount} 張圖片（開啟詳情才會載入）`}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            height: 18,
            px: '7px',
            mb: '2px',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.neutral.subtle,
            border: `1px solid ${color.border.default}`,
            ...typography.data[300],
            color: color.fg.neutral.muted,
          }}
        >
          <ImageIcon size={10} />
          {row.photoCount}
        </Box>
      ) : null}
      <Typography
        noWrap
        title={row.title}
        sx={{ ...typography.label[400], color: color.fg.neutral.default }}
      >
        {row.title}
      </Typography>
      <CutText title={address}>{address}</CutText>
    </Box>
  );
}

/** 需求 · 承接進度: each need as 「名稱 ×數量」, then the 待承接 line and its bar. */
function NeedsCell({ tasks }: { tasks: readonly TaskRow[] }) {
  if (tasks.length === 0) {
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: color.fg.neutral.muted,
        }}
      >
        <CircleDashed size={15} />
        <Typography
          noWrap
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          尚無需求 · 待補列
        </Typography>
      </Box>
    );
  }
  const progress = needProgress(tasks);
  const full = tasks.map(needChipLabel).join('、');
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
    >
      <Box
        title={full}
        sx={{
          display: 'flex',
          gap: '5px',
          flexWrap: 'nowrap',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {tasks.slice(0, CHIP_LIMIT).map((task) => (
          <NeedChip key={task.uuid} task={task} />
        ))}
        {tasks.length > CHIP_LIMIT ? (
          <Typography
            component="span"
            sx={{
              ...typography.body[300],
              color: color.fg.neutral.muted,
              alignSelf: 'center',
              flexShrink: 0,
            }}
          >
            +{tasks.length - CHIP_LIMIT}
          </Typography>
        ) : null}
      </Box>
      {progress.label ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            minWidth: 0,
          }}
        >
          <Typography
            noWrap
            sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
          >
            {progress.label}
          </Typography>
          <Box
            role="presentation"
            sx={{
              height: 4,
              borderRadius: '2px',
              bgcolor: color.bg.neutral.sunken,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                height: '100%',
                width: `${Math.round(progress.ratio * 100)}%`,
                bgcolor: color.fg.neutral.subtle,
              }}
            />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

/** A need's chip; one that is met or cancelled is faded and struck through. */
function NeedChip({ task }: { task: TaskRow }) {
  const closed = task.status === 'fulfilled' || task.status === 'canceled';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        maxWidth: '100%',
        height: 22,
        px: '9px',
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.subtle,
        border: `1px solid ${color.border.default}`,
        opacity: closed ? 0.55 : 1,
      }}
    >
      <Typography
        component="span"
        noWrap
        sx={{
          ...typography.data[300],
          fontWeight: 600,
          color: color.fg.neutral.subtle,
          textDecoration: closed ? 'line-through' : 'none',
        }}
      >
        {needChipLabel(task)}
      </Typography>
    </Box>
  );
}

/** 狀態: grey words; only 待處理 carries the small orange dot and reads darker. */
function StatusCell({ status }: { status: string }) {
  const pending = status === 'pending';
  return (
    <Typography
      noWrap
      sx={{
        ...typography.data[300],
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: pending ? color.fg.neutral.default : color.fg.neutral.muted,
        fontWeight: pending ? 600 : 400,
      }}
    >
      {pending ? (
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            flexShrink: 0,
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.default,
          }}
        />
      ) : null}
      {formatTicketStatusLabel(status)}
    </Typography>
  );
}

/**
 * 指派 Team: the teams of the 責任區 the ticket lies in, read-only. Withheld from a viewer without
 * detail on it, which is not the same as none.
 */
function TeamCell({ row }: { row: TicketRow }) {
  if (row.isCoarse) {
    return <CutText title="無權限檢視">無權限檢視</CutText>;
  }
  if (row.teamNames.length === 0) {
    return <CutText title="未指派">未指派</CutText>;
  }
  const names = row.teamNames.join('、');
  return (
    <CutText title={names} sx={{ color: color.fg.neutral.subtle }}>
      {names}
    </CutText>
  );
}

/**
 * The row's ⋯: what the viewer may do to this one ticket, by its own `viewerCan*` flags. Its
 * clicks stay in the cell (the menu is portalled, but React bubbles through it) so the row does
 * not open under it.
 */
function RowMenu({
  row,
  onOpen,
  onEdit,
  onDelete,
}: {
  row: TicketRow;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const items: NeedAction[] = [{ label: '開啟', onSelect: onOpen }];
  if (row.raw.viewerCanEdit) {
    items.push({ label: '編輯任務單', onSelect: onEdit });
  }
  if (row.raw.viewerCanDelete) {
    items.push({ label: '刪除任務單', onSelect: onDelete, tone: 'danger' });
  }
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <Box
      onClick={stop}
      onKeyDown={stop}
      sx={{ display: 'flex', justifyContent: 'flex-end' }}
    >
      <NeedActionsMenu needName={row.title} items={items} sx={{ my: '-8px' }} />
    </Box>
  );
}
