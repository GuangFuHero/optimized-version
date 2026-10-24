'use client';

import { Check, Inbox, X } from 'lucide-react';

import { Chip, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@rescue-frontend/data-access';
import {
  useApproveRoleRequest,
  useRejectRoleRequest,
  useRoleRequests,
} from '@rescue-frontend/data-access/admin';
import {
  Avatar,
  Badge,
  Button,
  type BadgeTone,
  Callout,
  designTokens,
  EmptyState,
} from '@rescue-frontend/ui';

import {
  ROLE_DISPLAY_NAMES,
  TEAM_TYPE_DISPLAY_NAMES,
} from '../../constants/roles';
import { ReasonDialog } from './dialogs';
import { captionSx, formatDateTime, Panel } from './parts';
import {
  applicantContact,
  decisionConflict,
  requestKind,
  type RequestKind,
  type RoleRequest,
} from './requests';

const { color, radius, typography } = designTokens;

/** One application waiting for a decision (the prototype's queue card). */
function QueueCard({
  applicant,
  kind,
  at,
  summary,
  note,
  hint,
  approveDisabled,
  onApprove,
  onReject,
}: {
  applicant: string;
  kind: { label: string; tone: BadgeTone };
  at: string;
  summary: ReactNode;
  note?: string | null;
  hint?: ReactNode;
  approveDisabled?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Panel
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <Avatar name={applicant} size={42} tone="neutral" />
      <Stack sx={{ flex: 1, minWidth: 220, gap: 1 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}
        >
          <Typography
            sx={{ ...typography.label[500], color: color.fg.neutral.default }}
          >
            {applicant}
          </Typography>
          <Badge tone={kind.tone}>{kind.label}</Badge>
          <Typography sx={captionSx}>{formatDateTime(at)}</Typography>
        </Stack>
        <Typography
          sx={{ ...typography.body[400], color: color.fg.neutral.default }}
        >
          {summary}
        </Typography>
        {note ? (
          <Typography
            sx={{
              p: '8px 12px',
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.subtle,
              ...typography.body[300],
              color: color.fg.neutral.subtle,
              whiteSpace: 'pre-wrap',
            }}
          >
            「{note}」
          </Typography>
        ) : null}
        {hint ? <Typography sx={captionSx}>{hint}</Typography> : null}
      </Stack>
      <Stack direction="row" sx={{ gap: 1, flexShrink: 0 }}>
        <Button
          size="sm"
          variant="ghost"
          startIcon={<X size={15} />}
          onClick={onReject}
          sx={{ color: color.fg.danger }}
        >
          拒絕
        </Button>
        <Button
          size="sm"
          startIcon={<Check size={15} />}
          disabled={approveDisabled}
          onClick={onApprove}
        >
          核准
        </Button>
      </Stack>
    </Panel>
  );
}

function EmptyQueue() {
  return (
    <Panel padding="0">
      <EmptyState
        icon={<Inbox />}
        title="目前沒有待審核項目"
        description="有新的加入團隊、建立團隊或平台角色申請時，會出現在這裡並於分頁顯示徽章。"
      />
    </Panel>
  );
}

/** `government` and `ngo` name a type of team, not a role (ADR-049). */
function requestedRoleLabel(role: string) {
  if (role === 'government') return TEAM_TYPE_DISPLAY_NAMES.get('gov') ?? role;
  if (role === 'ngo') return TEAM_TYPE_DISPLAY_NAMES.get('ngo') ?? role;
  return ROLE_DISPLAY_NAMES.get(role) ?? role;
}

const KIND_BADGE: Record<RequestKind, { label: string; tone: BadgeTone }> = {
  member: { label: '加入團隊申請', tone: 'info' },
  new_team: { label: '建立新團隊', tone: 'warning' },
  data_auditor: { label: '平台角色申請', tone: 'secondary' },
  legacy: { label: '舊版申請', tone: 'neutral' },
};

function summaryOf(request: RoleRequest, kind: RequestKind): ReactNode {
  const role = requestedRoleLabel(request.requested_role);
  switch (kind) {
    case 'member':
      return (
        <>
          {request.via_invite ? '掃描邀請 QR ' : ''}申請加入「
          <b>{request.team_name}</b>」（核准後以成員加入）
        </>
      );
    case 'new_team':
      return (
        <>
          申請建立新的{role}團隊「<b>{request.new_team_name}</b>
          」（核准後建立該隊，申請人為管理員）
        </>
      );
    case 'data_auditor':
      return (
        <>
          申請平台角色：<b>{ROLE_DISPLAY_NAMES.get('user')}</b> → <b>{role}</b>
        </>
      );
    case 'legacy':
      return (
        <>
          申請成為<b>{role}</b>，但沒有指定團隊
        </>
      );
  }
}

function approvedMessage(request: RoleRequest, kind: RequestKind): string {
  const who = request.applicant_name;
  if (kind === 'member') return `已核准 ${who} 加入「${request.team_name}」`;
  if (kind === 'new_team') {
    return `已建立「${request.new_team_name}」，${who} 為管理員`;
  }
  return `已核准 ${who} 為${requestedRoleLabel(request.requested_role)}`;
}

/**
 * A 409 on approve / reject, which the admin query client leaves to the queue (its mutations name
 * 409 as handled). Anything else was already reported there.
 */
function showDecisionConflict(error: Error) {
  if (!(error instanceof ApiError) || error.status !== 409) return;
  const conflict = decisionConflict(error.message);
  if (conflict.decided) toast.info(conflict.message);
  else toast.error(conflict.message);
}

/** Pending requests; `teamUuid` narrows to one team's member requests (a team admin's queue). */
export function usePendingRoleRequests(
  teamUuid?: string,
  options: { enabled?: boolean } = {},
) {
  return useRoleRequests(
    {
      query: {
        status: 'pending',
        ...(teamUuid ? { team_uuid: teamUuid } : {}),
      },
    },
    options,
  );
}

type KindFilter = Exclude<RequestKind, 'legacy'> | 'all';

const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'member', label: '加入團隊' },
  { id: 'new_team', label: '建立新團隊' },
  { id: 'data_auditor', label: '資料稽核員' },
];

/**
 * 審核佇列 (Spec/026). A super admin sees every pending request, of all three kinds; a team
 * admin (`teamUuid` set) sees the member requests for their own team, which is all the backend
 * gives them. First decision wins across both queues: a request decided elsewhere answers 409.
 */
export function RoleRequestQueue({ teamUuid }: { teamUuid?: string }) {
  const { data, isPending, isError } = usePendingRoleRequests(teamUuid);
  const approve = useApproveRoleRequest();
  const reject = useRejectRoleRequest();
  const [rejecting, setRejecting] = useState<RoleRequest | null>(null);
  const [filter, setFilter] = useState<KindFilter>('all');

  if (isPending) return <Typography sx={captionSx}>載入中…</Typography>;
  if (isError)
    return (
      <Callout tone="danger">無法載入審核佇列，請重新整理再試一次。</Callout>
    );

  const rows = data.filter(
    (request) => filter === 'all' || requestKind(request) === filter,
  );

  return (
    <Stack sx={{ gap: 1.5 }}>
      {teamUuid ? null : (
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {KIND_FILTERS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              color={filter === item.id ? 'primary' : 'default'}
              variant={filter === item.id ? 'filled' : 'outlined'}
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
            />
          ))}
        </Stack>
      )}
      {rows.length === 0 ? <EmptyQueue /> : null}
      {rows.map((request) => {
        const kind = requestKind(request);
        const contact = applicantContact(request);
        return (
          <QueueCard
            key={request.uuid}
            applicant={request.applicant_name}
            kind={KIND_BADGE[kind]}
            at={request.created_at}
            summary={summaryOf(request, kind)}
            note={request.reason}
            hint={
              kind === 'legacy'
                ? '這是舊版申請流程送出的，沒有指定要加入哪一隊，無法核准；請拒絕並請申請人重新送出。'
                : contact
                  ? `申請人資料：${contact}`
                  : undefined
            }
            approveDisabled={kind === 'legacy' || approve.isPending}
            onApprove={() =>
              approve.mutate(
                { params: { path: { request_uuid: request.uuid } }, body: {} },
                {
                  onSuccess: () =>
                    toast.success(approvedMessage(request, kind)),
                  onError: showDecisionConflict,
                },
              )
            }
            onReject={() => setRejecting(request)}
          />
        );
      })}
      {rejecting ? (
        <ReasonDialog
          title={`拒絕 ${rejecting.applicant_name} 的申請`}
          body="拒絕將通知申請人，並附上您的理由。"
          confirmLabel="確認拒絕"
          danger
          submitting={reject.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(note) =>
            reject.mutate(
              {
                params: { path: { request_uuid: rejecting.uuid } },
                body: { note },
              },
              {
                onSuccess: () => {
                  toast.success(`已拒絕 ${rejecting.applicant_name} 的申請`);
                  setRejecting(null);
                },
                onError: (error) => {
                  showDecisionConflict(error);
                  setRejecting(null);
                },
              },
            )
          }
        />
      ) : null}
    </Stack>
  );
}
