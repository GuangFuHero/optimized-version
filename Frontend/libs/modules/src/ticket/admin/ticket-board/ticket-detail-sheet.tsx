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

import { FreshnessCell } from '../../../station/admin/station-management/station-cells';
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
import type { TicketCapabilities } from './hooks/use-ticket-capabilities';
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
import { TicketHistoryPanel } from './ticket-history-panel';
import { TicketTaskList } from './ticket-task-list';

const { color, typography } = designTokens;

/** The station drawer's width, so both boards' drawers match. */
const TICKET_SHEET_WIDTH = 540;

type DetailTab = 'info' | 'history';

interface TicketDetailSheetProps {
  /** The ticket to show; null closes the sheet. */
  uuid: string | null;
  /** Show the ticket's edit form in place of its details (the form is not built yet). */
  editing: boolean;
  caps: TicketCapabilities;
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
  caps,
  now,
  onClose,
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

  useEffect(() => setActiveTab('info'), [uuid]);

  const state = ticketDetailState(query);
  const ticket = query.data?.ticket;

  let content: ReactNode;
  if (state === 'ready' && ticket) {
    content = (
      <TicketDetailContent
        // A fresh drawer per ticket: no half-typed need or audit note carried to the next one.
        key={ticket.uuid}
        ticket={ticket}
        view={toTicketDetailView(ticket, disasterLabels)}
        caps={caps}
        now={now}
        activeTab={caps.canViewHistory ? activeTab : 'info'}
        onTabChange={setActiveTab}
        onDeleted={onDeleted}
      />
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
        <Muted>找不到這張求助單，或你沒有檢視權限</Muted>
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
      onClose={onClose}
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
  caps,
  now,
  activeTab,
  onTabChange,
  onDeleted,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  caps: TicketCapabilities;
  now: Date;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onDeleted: (uuid: string) => void;
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
        caps.canDelete ? (
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => setDeleteOpen(true)}
            >
              刪除求助單
            </Button>
            <Box sx={{ flex: 1 }} />
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
          {caps.canViewHistory ? (
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
        <TicketInfo ticket={ticket} view={view} caps={caps} now={now} />
      )}
      {caps.canDelete ? (
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
        <Muted>{formatTicketNeedCount(needs.length)}</Muted>
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
  caps,
  now,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  caps: TicketCapabilities;
  now: Date;
}) {
  return (
    <Box sx={{ '& > :first-of-type': { borderTop: 'none', pt: 0 } }}>
      <Row label="最後更新">
        <FreshnessCell updatedAt={view.updatedAt} now={now} />
      </Row>
      <Row label="位置">
        {view.location.kind === 'coarse' ? (
          <Muted>約略位置（無檢視詳細位置權限）</Muted>
        ) : (
          <>
            {view.location.address}
            {view.location.floorRoom ? `\n${view.location.floorRoom}` : null}
          </>
        )}
      </Row>
      <Row label="聯絡人">
        {view.contact ? (
          [view.contact.name, view.contact.phone, view.contact.email]
            .filter(Boolean)
            .join('\n')
        ) : (
          <Muted>—</Muted>
        )}
      </Row>
      <Row label="災害類型">
        {view.disasterLabels.length ? (
          view.disasterLabels.join('、')
        ) : (
          <Muted>—</Muted>
        )}
      </Row>
      {view.disasterDetails.map((detail, index) => (
        <Row key={`${detail.label}-${index}`} label={detail.label}>
          {detail.value || '—'}
        </Row>
      ))}
      <Row label="說明">{view.description ?? <Muted>—</Muted>}</Row>
      <Block label="現場照片">
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
          <Muted>（尚無照片）</Muted>
        )}
      </Block>
      {caps.canAudit && ticket.auditContentHash ? (
        <Block label="審核">
          <TicketAuditCard ticket={ticket} />
        </Block>
      ) : null}
      <Block label="需求">
        <TicketTaskList ticket={ticket} caps={caps} />
      </Block>
    </Box>
  );
}

const ROW_BORDER = `1px solid ${color.border.default}`;

/** A caption on the left, its value right-aligned, as the station drawer's rows. */
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        minHeight: 48,
        boxSizing: 'border-box',
        py: '12px',
        borderTop: ROW_BORDER,
      }}
    >
      <Caption>{label}</Caption>
      <Box
        component="span"
        sx={{
          ...typography.body[400],
          color: color.fg.neutral.default,
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-line',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** A row whose value is too wide to sit beside its caption: the caption over it. */
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ py: '12px', borderTop: ROW_BORDER }}>
      <Box sx={{ mb: '8px' }}>
        <Caption>{label}</Caption>
      </Box>
      {children}
    </Box>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{
        ...typography.body[300],
        fontSize: 15,
        color: color.fg.neutral.muted,
        flexShrink: 0,
      }}
    >
      {children}
    </Typography>
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
