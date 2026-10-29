'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Box, ButtonBase, Tab, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  ticketHistoryQuery,
  useDeleteTicket,
  useDisasterTypes,
  useTicket,
  useTicketPropertyConfigs,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  CountBadge,
  designTokens,
  Dialog,
  SheetFrame,
  SheetLayout,
  Tabs,
} from '@rescue-frontend/ui';
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  PencilLine,
} from 'lucide-react';

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
import {
  ticketDetailState,
  toTicketDetailView,
  type DetailTicket,
  type TicketDetailView,
} from './model/ticket-detail-view';
import { isForbidden } from './model/task-actions';
import {
  AUDIT_BADGES,
  needProgress,
  toTaskRows,
  type AuditStatus,
  type TaskRowFields,
} from './model/ticket-row';
import { TicketAuditCard } from './ticket-audit-card';
import { TicketForm } from './ticket-form';
import {
  TICKET_HISTORY_PAGE,
  TicketHistoryPanel,
} from './ticket-history-panel';
import { NeedProgressBar, PriorityCell, StatusCell } from './ticket-table';
import { TicketTaskList } from './ticket-task-list';

const { color, radius, typography } = designTokens;

/** The ticket drawer's width, the prototype's `TKDrawer` (680px); the station drawer keeps its own. */
export const TICKET_SHEET_WIDTH = 680;

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
  // Active types only (retired ones need project.edit); a retired key shows as itself.
  const disasterTypes = useDisasterTypes({ includeInactive: false });
  const disasterLabels = useMemo(
    () =>
      Object.fromEntries(
        (disasterTypes.data?.disasterTypes ?? []).map((d) => [d.key, d.label]),
      ),
    [disasterTypes.data],
  );
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  // The edit form is saving, a need is being added, assigned or taken off, or a verdict sent:
  // Escape, the backdrop and × wait for it.
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
  // 現場災況 lists every field configured for the ticket's disaster types, filled or not. Active
  // fields only: inactive ones need dynamic_field.edit, and an answer to a retired field falls
  // back to its key.
  const disasterFields = useTicketPropertyConfigs(
    { disasterTypes: ticket?.disasterTypes ?? [], includeInactive: false },
    { enabled: Boolean(ticket?.disasterTypes.length) },
  );

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
        view={toTicketDetailView(
          ticket,
          disasterLabels,
          disasterFields.data?.ticketPropertyConfigs,
        )}
        fieldsLoading={
          ticket.disasterTypes.length > 0 && disasterFields.isPending
        }
        now={now}
        activeTab={ticket.viewerCanViewHistory ? activeTab : 'info'}
        onClose={close}
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
        closeLabel="關閉任務詳情"
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
        title="找不到任務單"
        closeLabel="關閉任務詳情"
        footer={
          <>
            <Box sx={{ flex: 1 }} />
            <Button variant="outline" size="md" onClick={onClose}>
              關閉
            </Button>
          </>
        }
      >
        <Muted inline>找不到這張任務單，或你沒有檢視權限</Muted>
      </SheetLayout>
    );
  } else {
    content = (
      <SheetLayout title="載入中…" closeLabel="關閉任務詳情">
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
      ariaLabel="任務詳情"
    >
      {content}
    </SheetFrame>
  );
}

function TicketDetailContent({
  ticket,
  view,
  fieldsLoading,
  now,
  activeTab,
  onTabChange,
  onClose,
  onEdit,
  onDeleted,
  onNeedBusyChange,
  onAuditBusyChange,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  /** The disaster fields' configs are still loading. */
  fieldsLoading: boolean;
  now: Date;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  /** 關閉, guarded like × while something is sending. */
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (uuid: string) => void;
  onNeedBusyChange: (busy: boolean) => void;
  onAuditBusyChange: (busy: boolean) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The tab's count: the first page the history tab loads, shared with it through the cache.
  const history = useQuery({
    ...ticketHistoryQuery({
      path: { uuid: ticket.uuid },
      query: { limit: TICKET_HISTORY_PAGE },
    }),
    enabled: ticket.viewerCanViewHistory,
  });
  const historyCount = history.data?.meta?.total;

  return (
    <SheetLayout
      title={view.title}
      subtitle={view.createdLabel}
      closeLabel="關閉任務詳情"
      footer={
        <>
          {ticket.viewerCanDelete ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => setDeleteOpen(true)}
            >
              刪除任務單
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Button variant="ghost" size="md" onClick={onClose}>
            關閉
          </Button>
          {ticket.viewerCanEdit ? (
            <Button
              size="md"
              startIcon={<PencilLine size={17} />}
              onClick={onEdit}
            >
              編輯任務單
            </Button>
          ) : null}
        </>
      }
      headerContent={
        ticket.viewerCanViewHistory ? (
          <Tabs
            aria-label="任務詳情分頁"
            value={activeTab}
            onChange={(_, tab: DetailTab) => onTabChange(tab)}
          >
            <Tab value="info" label="任務詳情" />
            <Tab
              value="history"
              label={
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  歷史紀錄
                  {historyCount != null ? (
                    <CountBadge count={historyCount} />
                  ) : null}
                </Box>
              }
            />
          </Tabs>
        ) : null
      }
    >
      {activeTab === 'history' ? (
        <TicketHistoryPanel uuid={ticket.uuid} />
      ) : (
        <TicketInfo
          ticket={ticket}
          view={view}
          fieldsLoading={fieldsLoading}
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

/**
 * 刪除任務單: the ticket with all its needs; the people on them hear. The drawer's footer and a
 * board row's ⋯ both open it.
 */
export function DeleteTicketConfirm({
  open,
  ticket,
  title,
  onClose,
  onDeleted,
}: {
  open: boolean;
  ticket: { uuid: string; tasks: readonly TaskRowFields[] };
  title: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteTicket();
  const [error, setError] = useState<string | null>(null);
  const needs = toTaskRows(ticket.tasks);

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
          ? '你的帳號沒有刪除任務單的權限。'
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
      title="刪除任務單？"
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

/**
 * 任務詳情, after the prototype's `TicketDetail`: the summary card, 地點資訊, 現場災況, the photos,
 * 需求與承接, and the audit card for whoever may give a verdict. What a coarse ticket withholds
 * reads 無權限檢視, never as missing. The prototype's 系統資訊 (公開範圍, 自動封存) is left out: a
 * ticket has no visibility, and nothing archives tickets or keeps an archive-days setting.
 */
function TicketInfo({
  ticket,
  view,
  fieldsLoading,
  now,
  onNeedBusyChange,
  onAuditBusyChange,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  fieldsLoading: boolean;
  now: Date;
  onNeedBusyChange: (busy: boolean) => void;
  onAuditBusyChange: (busy: boolean) => void;
}) {
  const progress = needProgress(toTaskRows(ticket.tasks));
  const hidden = <Muted inline>無權限檢視</Muted>;
  const unfilled = <Muted inline>未填</Muted>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SummaryCard ticket={ticket} view={view} now={now} />

      <Section title="地點資訊">
        <InfoRow label="地址">
          {view.location.kind === 'coarse' ? (
            <Muted inline>約略位置（無檢視詳細位置權限）</Muted>
          ) : (
            view.location.address
          )}
        </InfoRow>
        <InfoRow label="樓層">
          {view.location.kind === 'coarse'
            ? hidden
            : (view.location.floorRoom ?? unfilled)}
        </InfoRow>
        <InfoRow label="現場聯絡人">
          {view.detailHidden ? (
            hidden
          ) : view.contact ? (
            [view.contact.name, view.contact.phone, view.contact.email]
              .filter(Boolean)
              .join(' · ')
          ) : (
            <Muted inline>—</Muted>
          )}
        </InfoRow>
        <InfoRow label="狀況描述">
          {view.detailHidden
            ? hidden
            : (view.description ?? <Muted inline>—</Muted>)}
        </InfoRow>
      </Section>

      <Section title="現場災況" collapsible>
        <PendingNote
          title="欄位定義待確認"
          note="以下欄位名稱與選項為版型示意，尚未對應消防署／INSARAG 或各單位現行表單。上線前需由權責單位提供正式欄位清單。"
        />
        <InfoRow label="災害類型">
          {view.disasterLabels.length ? (
            view.disasterLabels.join('、')
          ) : (
            <Muted inline>—</Muted>
          )}
        </InfoRow>
        {view.disasterDetails.map((detail, index) => (
          <InfoRow key={`${detail.label}-${index}`} label={detail.label}>
            {detail.value ?? unfilled}
          </InfoRow>
        ))}
        {view.disasterDetails.length === 0 ? (
          <Muted inline>
            {fieldsLoading
              ? '載入災況欄位中…'
              : '這張任務單的災害類型沒有設定災況欄位。'}
          </Muted>
        ) : null}
      </Section>

      {/* The photos only where there are some (TM-IMG-137); withheld ones say so. */}
      {view.detailHidden ? (
        <Section title="現場照片">{hidden}</Section>
      ) : ticket.photos.length ? (
        <Section
          title="現場照片"
          right={
            <Muted inline>
              {`${ticket.photos.length} 張 · 平台只存網址，圖片在外部網站`}
            </Muted>
          }
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '10px',
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
        </Section>
      ) : null}

      <Section
        title="需求與承接"
        right={<Muted inline>{progress.label ?? '尚無需求'}</Muted>}
      >
        <TicketTaskList ticket={ticket} onBusyChange={onNeedBusyChange} />
      </Section>

      {ticket.viewerCanAudit && ticket.auditContentHash ? (
        <Section title="審核">
          <TicketAuditCard ticket={ticket} onBusyChange={onAuditBusyChange} />
        </Section>
      ) : null}
    </Box>
  );
}

/**
 * The card at the top: priority, status and audit state, 承接進度 over its bar; when it last
 * changed, and 指派 Team — the 責任區 teams, read-only (a team gets a ticket by its zone).
 */
function SummaryCard({
  ticket,
  view,
  now,
}: {
  ticket: DetailTicket;
  view: TicketDetailView;
  now: Date;
}) {
  const audit = AUDIT_BADGES[ticket.auditStatus as AuditStatus];
  const progress = needProgress(toTaskRows(ticket.tasks));
  const caption = { ...typography.body[300], color: color.fg.neutral.muted };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { mobile: 'minmax(0, 1fr)', tablet: '1fr 1fr' },
        gap: '16px',
        p: '16px',
        borderRadius: `${radius.lg}px`,
        bgcolor: color.bg.neutral.subtle,
        border: `1px solid ${color.border.default}`,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <PriorityCell priority={ticket.priority} />
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 24,
              px: '10px',
              boxSizing: 'border-box',
              borderRadius: `${radius.full}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            <StatusCell status={ticket.status} />
          </Box>
          <Badge tone={audit?.tone ?? 'neutral'}>{view.auditLabel}</Badge>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Typography component="span" sx={caption}>
            承接進度
          </Typography>
          {progress.label ? (
            <NeedProgressBar progress={progress} />
          ) : (
            <Muted inline>尚無需求 · 待補列</Muted>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '6px',
          }}
        >
          <FreshnessCell updatedAt={view.updatedAt} now={now} />
          <Typography component="span" sx={caption}>
            更新
          </Typography>
        </Box>
        <InfoRow label="指派 Team">
          {view.teamNames === null ? (
            <Muted inline>無權限檢視</Muted>
          ) : view.teamNames.length ? (
            view.teamNames.join('、')
          ) : (
            <Muted inline>未指派</Muted>
          )}
        </InfoRow>
      </Box>
    </Box>
  );
}

/** A titled part of the drawer; 現場災況 folds (prototype `Section`). */
function Section({
  title,
  right,
  collapsible = false,
  children,
}: {
  title: string;
  right?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const heading = {
    ...typography.label[500],
    color: color.fg.neutral.default,
  };
  return (
    <Box
      component="section"
      sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {collapsible ? (
          <ButtonBase
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              ...heading,
            }}
          >
            {open ? (
              <ChevronDown size={16} color={color.fg.neutral.muted} />
            ) : (
              <ChevronRight size={16} color={color.fg.neutral.muted} />
            )}
            {title}
          </ButtonBase>
        ) : (
          <Typography component="h3" sx={heading}>
            {title}
          </Typography>
        )}
        {right ? <Box sx={{ ml: 'auto' }}>{right}</Box> : null}
      </Box>
      {!collapsible || open ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

/** A caption in a 104px column, its value beside it (prototype `Row`). */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '104px 1fr',
        gap: '12px',
        alignItems: 'start',
      }}
    >
      <Typography
        component="span"
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.muted,
          pt: '2px',
        }}
      >
        {label}
      </Typography>
      <Box
        component="span"
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.default,
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

/** The prototype's 「資料待確認」 note: a dashed box with a question mark. */
function PendingNote({ title, note }: { title: string; note: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        p: '10px 12px',
        borderRadius: `${radius.md}px`,
        border: `1px dashed ${color.border.default}`,
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <Box
        sx={{
          mt: '2px',
          flexShrink: 0,
          color: color.fg.neutral.muted,
          display: 'flex',
        }}
      >
        <CircleHelp size={15} />
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          minWidth: 0,
        }}
      >
        <Typography
          component="span"
          sx={{
            ...typography.label[300],
            fontWeight: 700,
            color: color.fg.neutral.subtle,
          }}
        >
          {title}
        </Typography>
        <Typography
          component="span"
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          {note}
        </Typography>
      </Box>
    </Box>
  );
}
