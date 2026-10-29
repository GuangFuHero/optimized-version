'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Box, Tab, Typography } from '@mui/material';
import {
  useDeleteTicket,
  useDisasterTypes,
  useTicket,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  designTokens,
  Dialog,
  SheetFrame,
  SheetLayout,
  Tabs,
} from '@rescue-frontend/ui';
import { PencilLine } from 'lucide-react';

import { DetailBlock, DetailRow } from '../../../admin/shared/detail-rows';
import { Muted } from '../../../admin/shared/muted';
import { FreshnessCell } from '../../../admin/shared/freshness-cell';
import {
  isTicketAlreadyGone,
  deleteTicketErrorMessage,
  type ClaimError,
} from '../../needs/claim-error';
import {
  describeTicketDeletion,
  formatTicketNeedCount,
} from '../../needs/delete-ticket';
import { PhotoThumb } from '../../photos';
import { getTicketPriorityBadge, getTicketStatusTone } from '../../status';
import {
  ticketDetailState,
  toTicketDetailView,
  type DetailTicket,
  type TicketDetailView,
} from './model/ticket-detail-view';
import { isForbidden } from './model/task-actions';
import {
  AUDIT_BADGES,
  toTicketRow,
  type AuditStatus,
} from './model/ticket-row';
import { TicketAuditCard } from './ticket-audit-card';
import { TicketForm } from './ticket-form';
import { TicketHistoryPanel } from './ticket-history-panel';
import { TicketTaskList } from './ticket-task-list';

const { color, typography } = designTokens;

/** The station drawer's width, so both boards' drawers match. */
export const TICKET_SHEET_WIDTH = 540;

type DetailTab = 'info' | 'history';

interface TicketDetailSheetProps {
  /** The ticket to show; null closes the sheet. */
  uuid: string | null;
  /** Show the ticket's edit form in place of its details. */
  editing: boolean;
  now: Date;
  onClose: () => void;
  onEdit: (uuid: string) => void;
  /** The edit was cancelled or saved: back to the ticket's details. */
  onEditEnd: () => void;
  /** The ticket was deleted from the drawer. */
  onDeleted: (uuid: string) => void;
}

/**
 * `/tickets`' drawer for one ticket: its details, needs and photos, and its change history.
 * Mounted for any `?ticket=`, whether or not that ticket is in the board's current rows.
 */
export function TicketDetailSheet({
  uuid,
  editing,
  now,
  onClose,
  onEdit,
  onEditEnd,
  onDeleted,
}: TicketDetailSheetProps) {
  const query = useTicket({ uuid: uuid ?? '' }, { enabled: Boolean(uuid) });
  const disasterTypes = useDisasterTypes();
  const disasterLabels = useMemo(
    () =>
      Object.fromEntries(
        (disasterTypes.data?.disasterTypes ?? []).map((d) => [d.key, d.label]),
      ),
    [disasterTypes.data],
  );
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  // The edit form is saving, a need is being added or a verdict sent: Escape, the backdrop and ×
  // wait for it.
  const [formBusy, setFormBusy] = useState(false);
  const [needBusy, setNeedBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const busy = formBusy || needBusy || auditBusy;
  const close = () => {
    if (!busy) onClose();
  };

  useEffect(() => setActiveTab('info'), [uuid]);

  const state = ticketDetailState(query);
  const ticket = query.data?.ticket;

  let content: ReactNode;
  if (state === 'ready' && ticket && editing && ticket.viewerCanEdit) {
    // 取消 or a save: back to the details, in the same frame.
    content = (
      <TicketForm
        key={ticket.uuid}
        mode="edit"
        ticket={ticket}
        onDone={onEditEnd}
        onCancel={onEditEnd}
        onBusyChange={setFormBusy}
      />
    );
  } else if (state === 'ready' && ticket) {
    content = (
      <TicketDetailContent
        // A fresh drawer per ticket: no half-typed need or audit note carried to the next one.
        key={ticket.uuid}
        ticket={ticket}
        view={toTicketDetailView(ticket, disasterLabels)}
        now={now}
        activeTab={ticket.viewerCanViewHistory ? activeTab : 'info'}
        onTabChange={setActiveTab}
        onEdit={() => onEdit(ticket.uuid)}
        onDeleted={onDeleted}
        onNeedBusyChange={setNeedBusy}
        onAuditBusyChange={setAuditBusy}
      />
    );
  } else if (state === 'failed') {
    content = (
      <SheetLayout
        title="載入失敗"
        closeLabel="關閉求助單詳情"
        footer={
          <>
            <Box sx={{ flex: 1 }} />
            <Button variant="outline" size="md" onClick={onClose}>
              關閉
            </Button>
            <Button
              size="md"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              重試
            </Button>
          </>
        }
      >
        <Muted inline>載入失敗，請重試</Muted>
      </SheetLayout>
    );
  } else if (state === 'missing') {
    content = (
      <SheetLayout
        title="找不到求助單"
        closeLabel="關閉求助單詳情"
        footer={
          <>
            <Box sx={{ flex: 1 }} />
            <Button variant="outline" size="md" onClick={onClose}>
              關閉
            </Button>
          </>
        }
      >
        <Muted inline>找不到這張求助單，或你沒有檢視權限</Muted>
      </SheetLayout>
    );
  } else {
    content = (
      <SheetLayout title="載入中…" closeLabel="關閉求助單詳情">
        {null}
      </SheetLayout>
    );
  }

  return (
    <SheetFrame
      open={Boolean(uuid)}
      onClose={close}
      width={TICKET_SHEET_WIDTH}
      variant="admin"
      ariaLabel="求助單詳情"
    >
      {content}
    </SheetFrame>
  );
}

function TicketDetailContent({
  ticket,
  view,
  now,
  activeTab,
  onTabChange,
  onEdit,
  onDeleted,
  onNeedBusyChange,
  onAuditBusyChange,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  now: Date;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onEdit: () => void;
  onDeleted: (uuid: string) => void;
  onNeedBusyChange: (busy: boolean) => void;
  onAuditBusyChange: (busy: boolean) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const priority = getTicketPriorityBadge(ticket.priority);
  const audit = AUDIT_BADGES[ticket.auditStatus as AuditStatus];

  return (
    <SheetLayout
      eyebrow="求助單"
      title={view.title}
      closeLabel="關閉求助單詳情"
      footer={
        ticket.viewerCanDelete || ticket.viewerCanEdit ? (
          <>
            {ticket.viewerCanDelete ? (
              <Button
                variant="outline"
                size="md"
                onClick={() => setDeleteOpen(true)}
              >
                刪除求助單
              </Button>
            ) : null}
            <Box sx={{ flex: 1 }} />
            {ticket.viewerCanEdit ? (
              <Button
                size="md"
                startIcon={<PencilLine size={17} />}
                onClick={onEdit}
              >
                編輯
              </Button>
            ) : null}
          </>
        ) : undefined
      }
      headerContent={
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <Badge tone={getTicketStatusTone(ticket.status)} variant="solid">
              {view.statusLabel}
            </Badge>
            {priority ? (
              <Badge tone={priority.tone} variant={priority.variant}>
                {priority.label}
              </Badge>
            ) : (
              <Badge>{view.priorityLabel}</Badge>
            )}
            <Badge tone={audit?.tone ?? 'neutral'}>{view.auditLabel}</Badge>
          </Box>
          {ticket.viewerCanViewHistory ? (
            <Tabs
              aria-label="求助單詳情分頁"
              value={activeTab}
              onChange={(_, tab: DetailTab) => onTabChange(tab)}
              sx={{ mt: '14px' }}
            >
              <Tab value="info" label="基本資料" />
              <Tab value="history" label="變更紀錄" />
            </Tabs>
          ) : null}
        </>
      }
    >
      {activeTab === 'history' ? (
        <TicketHistoryPanel uuid={ticket.uuid} />
      ) : (
        <TicketInfo
          ticket={ticket}
          view={view}
          now={now}
          onNeedBusyChange={onNeedBusyChange}
          onAuditBusyChange={onAuditBusyChange}
        />
      )}
      {ticket.viewerCanDelete ? (
        <DeleteTicketConfirm
          open={deleteOpen}
          ticket={ticket}
          title={view.title}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            onDeleted(ticket.uuid);
          }}
        />
      ) : null}
    </SheetLayout>
  );
}

/** 刪除求助單: the ticket with all its needs; the people on them hear. */
function DeleteTicketConfirm({
  open,
  ticket,
  title,
  onClose,
  onDeleted,
}: {
  open: boolean;
  ticket: DetailTicket;
  title: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteTicket();
  const [error, setError] = useState<string | null>(null);
  const needs = toTicketRow(
    // The detail ticket is a superset of the list's fragment.
    ticket as unknown as Parameters<typeof toTicketRow>[0],
  ).tasks;

  const confirm = async () => {
    if (remove.isPending) return;
    setError(null);
    try {
      await remove.mutateAsync({ uuid: ticket.uuid });
      onDeleted();
    } catch (caught) {
      const refusal = caught as ClaimError;
      // Deleted already, from another tab: what was asked for has happened.
      if (isTicketAlreadyGone(refusal)) {
        onDeleted();
        return;
      }
      setError(
        isForbidden(refusal)
          ? '你的帳號沒有刪除求助單的權限。'
          : deleteTicketErrorMessage(refusal),
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      onExited={() => setError(null)}
      title="刪除求助單？"
      confirmLabel={remove.isPending ? '刪除中…' : '刪除'}
      confirmTone="danger"
      error={error}
      submitting={remove.isPending}
    >
      <Box>
        <Typography
          sx={{
            ...typography.body[400],
            color: color.fg.neutral.default,
            fontWeight: 600,
          }}
        >
          {title}
        </Typography>
        <Muted inline>{formatTicketNeedCount(needs.length)}</Muted>
      </Box>
      <Typography
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.muted,
          lineHeight: 1.6,
        }}
      >
        {describeTicketDeletion(needs)}
      </Typography>
    </Dialog>
  );
}

function TicketInfo({
  ticket,
  view,
  now,
  onNeedBusyChange,
  onAuditBusyChange,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  now: Date;
  onNeedBusyChange: (busy: boolean) => void;
  onAuditBusyChange: (busy: boolean) => void;
}) {
  return (
    <Box sx={{ '& > :first-of-type': { borderTop: 'none', pt: 0 } }}>
      <DetailRow label="最後更新">
        <FreshnessCell updatedAt={view.updatedAt} now={now} />
      </DetailRow>
      <DetailRow label="位置">
        {view.location.kind === 'coarse' ? (
          <Muted inline>約略位置（無檢視詳細位置權限）</Muted>
        ) : (
          <>
            {view.location.address}
            {view.location.floorRoom ? `\n${view.location.floorRoom}` : null}
          </>
        )}
      </DetailRow>
      <DetailRow label="聯絡人">
        {view.contact ? (
          [view.contact.name, view.contact.phone, view.contact.email]
            .filter(Boolean)
            .join('\n')
        ) : (
          <Muted inline>—</Muted>
        )}
      </DetailRow>
      <DetailRow label="災害類型">
        {view.disasterLabels.length ? (
          view.disasterLabels.join('、')
        ) : (
          <Muted inline>—</Muted>
        )}
      </DetailRow>
      {view.disasterDetails.map((detail, index) => (
        <DetailRow key={`${detail.label}-${index}`} label={detail.label}>
          {detail.value || '—'}
        </DetailRow>
      ))}
      <DetailRow label="說明">
        {view.description ?? <Muted inline>—</Muted>}
      </DetailRow>
      <DetailBlock label="現場照片">
        {ticket.photos.length ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {ticket.photos.map((photo, index) => (
              <PhotoThumb
                key={photo.uuid}
                url={photo.url}
                index={index}
                linksOut
              />
            ))}
          </Box>
        ) : (
          <Muted inline>（尚無照片）</Muted>
        )}
      </DetailBlock>
      {ticket.viewerCanAudit && ticket.auditContentHash ? (
        <DetailBlock label="審核">
          <TicketAuditCard ticket={ticket} onBusyChange={onAuditBusyChange} />
        </DetailBlock>
      ) : null}
      <DetailBlock label="需求">
        <TicketTaskList ticket={ticket} onAddBusyChange={onNeedBusyChange} />
      </DetailBlock>
    </Box>
  );
}

/** A caption on the left, its value right-aligned, as the station drawer's rows. */
