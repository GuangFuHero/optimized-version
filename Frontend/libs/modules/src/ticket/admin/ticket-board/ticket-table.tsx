'use client';

import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import {
  Button,
  Callout,
  DataTable,
  designTokens,
  EmptyState,
  ListPagination,
  Progress,
  Tag,
  type DataTableProps,
} from '@rescue-frontend/ui';
import {
  CircleDashed,
  ClipboardList,
  Flag,
  Image as ImageIcon,
  PanelRightOpen,
  Plus,
  SearchX,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { ReactNode, SyntheticEvent } from 'react';

import { FreshnessCell } from '../../../admin/shared/freshness-cell';
import { Muted } from '../../../admin/shared/muted';
import { NeedActionsMenu } from '../../needs/need-actions-menu';
import type { NeedAction } from '../../needs/need-actions';
import { TicketStatusTag } from '../ticket-status-tag';
import type { SpaceListRow } from '../space/space-analysis';
import { SpacePill, SpaceTag, StateBadge } from '../space/space-badges';
import { spaceTicketTag, type TaggedSpace } from '../space/space-ticket-tag';
import {
  TICKET_TABLE_MIN_WIDTH,
  visibleTicketColumns,
  type TicketColumnId,
} from './model/ticket-columns';
import { ticketPriorityLabel } from './model/ticket-detail-view';
import { adminTicketPriorityTag } from './model/ticket-priority';
import {
  needChipLabel,
  needProgress,
  ticketAddressLine,
  type NeedProgress,
  type TaskRow,
  type TicketRow,
} from './model/ticket-row';

const { color, radius, typography } = designTokens;

/** Needs shown as chips before the rest fold into +N; the whole list is on hover. */
const CHIP_LIMIT = 3;

/** A row of the board: a ticket, or a 開啟空間 space listed beside them (BE-036). */
type BoardRow = TicketRow | SpaceListRow;

const isSpaceRow = (row: BoardRow): row is SpaceListRow =>
  'kind' in row && row.kind === 'space';

const NO_SPACES: readonly SpaceListRow[] = [];
const NO_TAGS: ReadonlyMap<string, TaggedSpace> = new Map();

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
  /** 刪除任務單 from a row's ⋯; offered only where the ticket's `viewerCanDelete` allows. */
  onDeleteTicket: (row: TicketRow) => void;
  /** 新增任務 in the empty board; unset when the viewer may not add. */
  onCreate?: () => void;
  /**
   * The spaces the filters let through, in order. The tickets come paged and sorted by the
   * server, so the spaces sit above them on the first page.
   */
  spaces?: readonly SpaceListRow[];
  /** Every loaded space, for the 「🏢 名稱 · 3F」 tag on a ticket filed in one. */
  spaceTags?: ReadonlyMap<string, TaggedSpace>;
  onOpenSpace?: (uuid: string) => void;
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
  onDeleteTicket,
  onCreate,
  spaces = NO_SPACES,
  spaceTags = NO_TAGS,
  onOpenSpace,
}: TicketTableProps) {
  const renderCell = (id: TicketColumnId, row: BoardRow): ReactNode =>
    isSpaceRow(row) ? renderSpaceCell(id, row) : renderTicketCell(id, row);

  const renderTicketCell = (id: TicketColumnId, row: TicketRow): ReactNode => {
    switch (id) {
      case 'priority':
        return <PriorityCell priority={row.priority} />;
      case 'ticket':
        return (
          <TicketCell row={row} tag={spaceTicketTag(row.raw, spaceTags)} />
        );
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
            onDelete={() => onDeleteTicket(row)}
          />
        );
    }
  };

  const renderSpaceCell = (
    id: TicketColumnId,
    row: SpaceListRow,
  ): ReactNode => {
    switch (id) {
      case 'priority':
        return row.priority ? (
          <PriorityCell priority={row.priority} />
        ) : (
          <Muted cell>—</Muted>
        );
      case 'ticket':
        return <SpaceCell row={row} />;
      case 'needs':
        return (
          <Box sx={{ minWidth: 0 }}>
            <CutText
              title={row.summary}
              sx={{ color: color.fg.neutral.subtle }}
            >
              {row.summary}
            </CutText>
            {row.volunteerGap > 0 ? (
              <Typography
                noWrap
                sx={{ ...typography.label[300], color: color.fg.warning }}
              >
                缺 {row.volunteerGap} 人
              </Typography>
            ) : null}
          </Box>
        );
      case 'updated':
        return row.updatedAt ? (
          <FreshnessCell updatedAt={row.updatedAt} now={now} />
        ) : (
          <Muted cell>—</Muted>
        );
      case 'status':
        return <StateBadge state={row.status} />;
      case 'team':
        return <Muted cell>—</Muted>;
      case 'menu':
        return null;
    }
  };

  const data: readonly BoardRow[] =
    page === 1 && spaces.length ? [...spaces, ...rows] : rows;

  const columns: DataTableProps<BoardRow>['columns'] =
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
      <DataTable
        columns={columns}
        data={data}
        minWidth={TICKET_TABLE_MIN_WIDTH}
        getRowId={(row) => (isSpaceRow(row) ? `space:${row.id}` : row.uuid)}
        onRowClick={(row) =>
          isSpaceRow(row) ? onOpenSpace?.(row.id) : onOpenTicket(row.uuid)
        }
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

/** 生命危急 solid red, 緊急 a pale warning, 一般 and 低 quiet grey words (`adminTicketPriorityTag`). */
export function PriorityCell({ priority }: { priority: string }) {
  const tag = adminTicketPriorityTag(priority);
  if (tag) {
    return (
      <Tag tone={tag.tone} fill={tag.fill}>
        {tag.label}
      </Tag>
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

/**
 * 任務: the photo count (never the images), the title with 疑似重複 on a suspected duplicate and
 * its space's 「🏢 名稱 · 3F」 when it was filed in one, and the street line under it.
 */
function TicketCell({ row, tag }: { row: TicketRow; tag: string | null }) {
  const address = ticketAddressLine(row);
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
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}
      >
        <Typography
          noWrap
          title={row.title}
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          {row.title}
        </Typography>
        {row.suspectedDuplicateOf ? (
          <Box
            component="span"
            title="疑似重複 · 待查核"
            sx={{ display: 'inline-flex', flexShrink: 0 }}
          >
            <Tag tone="warning" size="sm" icon={<Flag size={10} />}>
              疑似重複
            </Tag>
          </Box>
        ) : null}
        {tag ? <SpacePill title={tag}>{tag}</SpacePill> : null}
      </Box>
      <CutText title={address}>{address}</CutText>
    </Box>
  );
}

/** A space's 任務 cell, as the prototype's SpaceRow: 空間 above the name, the address under it. */
function SpaceCell({ row }: { row: SpaceListRow }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <SpaceTag />
      <Typography
        noWrap
        title={row.name}
        sx={{
          ...typography.label[400],
          color: color.fg.neutral.default,
          mt: '2px',
        }}
      >
        {row.name}
      </Typography>
      {row.address ? (
        <CutText title={row.address}>{row.address}</CutText>
      ) : null}
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
      <NeedProgressBar progress={progress} />
    </Box>
  );
}

/**
 * 承接進度: the 待承接 line over its grey bar (PRG-101, PRG-102); nothing with no need to count.
 * Green only once every need is met: 在途 3／3, everyone taken but not there yet, is not done.
 */
export function NeedProgressBar({
  progress,
  label,
  size = 'sm',
}: {
  progress: NeedProgress;
  /** Words on the left of the numbers, as the detail sheet names the bar. */
  label?: ReactNode;
  /** PRG-101: sm (4px) in the table, md (6px) in the detail sheet. */
  size?: 'sm' | 'md';
}) {
  if (!progress.label) return null;
  return (
    <Progress
      label={label}
      value={progress.total - progress.waiting}
      max={progress.total}
      valueText={progress.label}
      complete={progress.fulfilled === progress.total}
      tone="neutral"
      size={size}
    />
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
export function StatusCell({ status }: { status: string }) {
  return <TicketStatusTag status={status} />;
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
 * The row's ⋯: view, 指派 Team (not open yet), and delete where the ticket's `viewerCanDelete` allows. Its
 * clicks stay in the cell (the menu is portalled, but React bubbles through it) so the row does
 * not open under it.
 */
function RowMenu({
  row,
  onOpen,
  onDelete,
}: {
  row: TicketRow;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const items: NeedAction[] = [
    { label: '檢視任務', icon: <PanelRightOpen size={16} />, onSelect: onOpen },
    {
      // The backend has no ticket–team assignment yet (ADR-049): drawn as the design does, not wired.
      label: '指派 Team',
      icon: <UserPlus size={16} />,
      onSelect: () => undefined,
      disabled: true,
      hint: '尚未開放',
    },
  ];
  if (row.raw.viewerCanDelete) {
    items.push({
      label: '刪除任務',
      icon: <Trash2 size={16} />,
      onSelect: onDelete,
      tone: 'danger',
      dividerBefore: true,
    });
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
