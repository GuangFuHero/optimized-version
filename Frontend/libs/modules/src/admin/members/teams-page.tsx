'use client';

import {
  Building2,
  KeySquare,
  Lock,
  Pencil,
  Plus,
  QrCode,
  UserPlus,
  Users,
} from 'lucide-react';

import { Box, ButtonBase, Stack, Tab, Tabs, Typography } from '@mui/material';
import { createColumnHelper } from '@tanstack/react-table';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  useAddTeamMember,
  useAllUsers,
  useCurrentUser,
  useRemoveTeamMember,
  useSetTeamStatus,
  useTeamDirectory,
  useTeamMembers,
  useTeams,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import {
  Badge,
  Button,
  Callout,
  CountBadge,
  DataTable,
  designTokens,
  Dialog,
  EmptyState,
  type DataTableFeatures,
} from '@rescue-frontend/ui';

import { AdminErrorPage } from '../../shell/admin/error-page';
import { NeedActionsMenu } from '../../ticket/needs/need-actions-menu';
import type { NeedAction } from '../../ticket/needs/need-actions';
import { TeamStatusBadge, TeamTypeBadge } from './badges';
import {
  AddMemberDialog,
  BlockDialog,
  CreateTeamDialog,
  EditTeamDialog,
} from './dialogs';
import { InviteSheet } from './invite-sheet';
import { MemberTable } from './member-table';
import { AuditLog } from './audit-log';
import { RoleRequestQueue, usePendingRoleRequests } from './queue';
import { captionSx, PageFrame, Panel, SearchField, StatPill } from './parts';
import {
  adminCount,
  isLastAdmin,
  matchesName,
  memberCounts,
  rosterFromMembers,
  teamRoster,
  teamTypesOf,
  type RosterMember,
  type Team,
} from './roster';

const { color, radius, typography, motion } = designTokens;

type Perm = components['schemas']['Perm'];

const LAST_ADMIN_RULE =
  '系統約束 EA1 — 每個運作中的團隊必須至少保留 1 位管理員';

type Blocked = { title: string; body: string } | null;

/**
 * The ⋯ of a roster row: promote or demote, then remove. Refuses to leave a team without an
 * admin before asking; the backend refuses it as well (409, ADR-356).
 */
function useRosterActions(team: Team, roster: readonly RosterMember[]) {
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [removing, setRemoving] = useState<RosterMember | null>(null);

  const setRole = (member: RosterMember, role: 'admin' | 'member') =>
    addMember.mutate(
      {
        params: { path: { team_uuid: team.uuid } },
        body: { user_uuid: member.uuid, team_role_name: role },
      },
      {
        onSuccess: () =>
          toast.success(
            role === 'admin'
              ? `${member.name} 已升為管理員`
              : `${member.name} 已降為成員`,
          ),
      },
    );

  const actionsFor = (member: RosterMember): NeedAction[] => [
    member.role === 'member'
      ? { label: '升為管理員', onSelect: () => setRole(member, 'admin') }
      : {
          label: '降為成員',
          onSelect: () =>
            isLastAdmin(roster, member)
              ? setBlocked({
                  title: '無法降級此成員',
                  body: `${member.name} 是「${team.name}」目前唯一一位管理員。請先將另一位成員升為管理員接班，才能降級。`,
                })
              : setRole(member, 'member'),
        },
    {
      label: '移除出隊',
      tone: 'danger',
      onSelect: () =>
        isLastAdmin(roster, member)
          ? setBlocked({
              title: '無法移除此成員',
              body: `${member.name} 是「${team.name}」唯一的管理員，請先指派接班人。`,
            })
          : setRemoving(member),
    },
  ];

  const dialogs = (
    <>
      {blocked ? (
        <BlockDialog
          title={blocked.title}
          body={blocked.body}
          rule={LAST_ADMIN_RULE}
          onClose={() => setBlocked(null)}
        />
      ) : null}
      {removing ? (
        <Dialog
          open
          title={`將 ${removing.name} 移除出隊`}
          confirmLabel="確認移除"
          confirmTone="danger"
          submitting={removeMember.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            removeMember.mutate(
              {
                params: {
                  path: { team_uuid: team.uuid, user_uuid: removing.uuid },
                },
              },
              {
                onSuccess: () => {
                  toast.success(`已將 ${removing.name} 移除出隊`);
                  setRemoving(null);
                },
              },
            )
          }
        >
          <Typography
            sx={{ ...typography.body[400], color: color.fg.neutral.default }}
          >
            僅移除其在「{team.name}
            」的歸屬，不影響其在其他團隊的身份，也不變更其平台角色。
          </Typography>
        </Dialog>
      ) : null}
    </>
  );

  return { actionsFor, dialogs };
}

function TeamRailItem({
  team,
  count,
  active,
  onClick,
}: {
  team: Team;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0.5,
        p: '12px 14px',
        textAlign: 'left',
        borderRadius: `${radius.md}px`,
        bgcolor: active ? color.bg.primary.subtle : 'transparent',
        boxShadow: active
          ? `inset 3px 0 0 ${color.bg.primary.default}`
          : 'none',
        opacity: team.status === 'suspended' ? 0.65 : 1,
        transition: `background ${motion.transition.fast}`,
        '&:hover': {
          bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.subtle,
        },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography
          noWrap
          sx={{
            ...typography.label[400],
            flex: 1,
            color: active
              ? color.brand.primary.subtle
              : color.fg.neutral.default,
          }}
        >
          {team.name}
        </Typography>
        <TeamStatusBadge status={team.status} />
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <TeamTypeBadge type={team.type} />
        <Typography sx={captionSx}>{count} 位成員</Typography>
      </Stack>
    </ButtonBase>
  );
}

function NoTeamsYet({ onCreate }: { onCreate: () => void }) {
  return (
    <Panel>
      <EmptyState
        icon={<Building2 />}
        title="還沒有任何團隊"
        description={
          <>
            團隊是平台上做事的單位：政府單位與非政府組織各自成一隊。
            <br />
            任務單、資源站點、互助地圖的責任區都是指派給團隊的 ——
            所以開站後通常先建團隊。
          </>
        }
        action={
          <Button startIcon={<Plus size={17} />} onClick={onCreate}>
            新增團隊
          </Button>
        }
      />
    </Panel>
  );
}

/** Tax ID and contact, where the team is already visible (ADR-357 point 5). */
function TeamFacts({ team }: { team: Team }) {
  const contact = [team.contact_name, team.contact_phone]
    .filter(Boolean)
    .join(' · ');
  if (!team.tax_id && !contact) return null;
  return (
    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
      {team.tax_id ? (
        <Typography sx={{ ...captionSx, color: color.fg.neutral.subtle }}>
          統一編號 {team.tax_id}
        </Typography>
      ) : null}
      {contact ? (
        <Typography sx={{ ...captionSx, color: color.fg.neutral.subtle }}>
          聯絡窗口 {contact}
        </Typography>
      ) : null}
    </Stack>
  );
}

/**
 * Suspend or restore (`POST /admin/teams/{uuid}/status`, super admin only, ADR-357). There is no
 * disbanding: a team winds down by its admin removing the other members (ADMIN-027 Story 4).
 */
function TeamStatusDialog({
  team,
  onClose,
}: {
  team: Team;
  onClose: () => void;
}) {
  const setStatus = useSetTeamStatus();
  const suspending = team.status === 'active';

  return (
    <Dialog
      open
      title={suspending ? `暫停「${team.name}」` : `恢復「${team.name}」`}
      confirmLabel={suspending ? '確認暫停' : '確認恢復'}
      confirmTone={suspending ? 'danger' : 'primary'}
      submitting={setStatus.isPending}
      onClose={onClose}
      onConfirm={() =>
        setStatus.mutate(
          {
            params: { path: { team_uuid: team.uuid } },
            body: { status: suspending ? 'suspended' : 'active' },
          },
          {
            onSuccess: () => {
              toast.success(
                suspending
                  ? `已暫停「${team.name}」`
                  : `已恢復「${team.name}」`,
              );
              onClose();
            },
          },
        )
      }
    >
      <Typography
        sx={{ ...typography.body[400], color: color.fg.neutral.default }}
      >
        {suspending
          ? '暫停後，成員立即無法以本隊身份操作（下次請求即登出該身份），邀請連結失效，待審的加入申請會被拒絕並通知申請人。成員名單與資料都保留，可隨時恢復。'
          : '恢復後，成員可再切換到本隊身份，原有的團隊角色照舊，不必重新加入。'}
      </Typography>
    </Dialog>
  );
}

function TeamDetail({
  team,
  teams,
  roster,
  candidates,
  teamTypes,
  focusMemberUuid,
  siteUrl,
}: {
  team: Team;
  teams: readonly Team[];
  roster: readonly RosterMember[];
  candidates: Parameters<typeof AddMemberDialog>[0]['candidates'];
  teamTypes: ReadonlyMap<string, string>;
  /** Marked in the roster: the applicant just approved as this new team's admin. */
  focusMemberUuid?: string | null;
  siteUrl?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const { actionsFor, dialogs } = useRosterActions(team, roster);
  const admins = adminCount(roster);
  const running = team.status === 'active';

  const teamActions: NeedAction[] = [
    { label: '編輯團隊資料', onSelect: () => setEditing(true) },
    running
      ? {
          label: '暫停團隊',
          tone: 'danger' as const,
          onSelect: () => setChangingStatus(true),
        }
      : { label: '恢復團隊', onSelect: () => setChangingStatus(true) },
  ];

  return (
    <Stack sx={{ gap: 2, minWidth: 0 }}>
      {team.status === 'suspended' ? (
        <Callout tone="danger">
          <b>此團隊已暫停</b>
          <br />
          成員無法以本隊身份操作，名單與資料保留；恢復後原有角色照舊。
        </Callout>
      ) : null}

      <Panel sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}
        >
          <Stack sx={{ flex: 1, minWidth: 200, gap: 1 }}>
            <Stack
              direction="row"
              sx={{ alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}
            >
              <Typography
                component="h2"
                sx={{ ...typography.heading[600], m: 0 }}
              >
                {team.name}
              </Typography>
              <TeamTypeBadge type={team.type} />
              <TeamStatusBadge status={team.status} />
            </Stack>
            <TeamFacts team={team} />
          </Stack>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: 1, flexShrink: 0 }}
          >
            {running ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  startIcon={<UserPlus size={15} />}
                  onClick={() => setAdding(true)}
                >
                  加入成員
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  startIcon={<QrCode size={15} />}
                  onClick={() => setInviting(true)}
                >
                  邀請 QR
                </Button>
              </>
            ) : null}
            <NeedActionsMenu needName={team.name} items={teamActions} />
          </Stack>
        </Stack>
        <Stack direction="row" sx={{ gap: 1.25, flexWrap: 'wrap' }}>
          <StatPill Icon={Users} label="成員" value={roster.length} />
          {/* Red only at zero: a running team with no admin is broken (EA1) and needs a super
              admin to appoint one; a single admin is fine and the demote/remove guard covers it. */}
          <StatPill
            Icon={KeySquare}
            label="管理員"
            value={admins}
            danger={running && roster.length > 0 && admins === 0}
          />
        </Stack>
      </Panel>

      <Stack sx={{ gap: 1 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}
        >
          <Typography
            component="h3"
            sx={{ ...typography.heading[600], fontSize: 17, flex: 1 }}
          >
            成員名單
          </Typography>
          <Typography sx={captionSx}>
            超級管理員全域可見；各隊的管理員只看得到自己那一隊
          </Typography>
        </Stack>
        <MemberTable
          rows={roster}
          highlightUuid={focusMemberUuid}
          actionsFor={running ? actionsFor : undefined}
          empty={
            <EmptyState
              icon={<Users />}
              title="尚無成員"
              description="產生邀請 QR，讓夥伴掃碼加入；或用「加入成員」加入已註冊的帳號。"
            />
          }
        />
      </Stack>

      {dialogs}
      {adding ? (
        <AddMemberDialog
          team={team}
          candidates={candidates.filter(
            (user) => !roster.some((member) => member.uuid === user.uuid),
          )}
          teamTypes={teamTypes}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {inviting ? (
        <InviteSheet
          team={team}
          siteUrl={siteUrl}
          onClose={() => setInviting(false)}
        />
      ) : null}
      {editing ? (
        <EditTeamDialog
          team={team}
          teams={teams}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {changingStatus ? (
        <TeamStatusDialog
          team={team}
          onClose={() => setChangingStatus(false)}
        />
      ) : null}
    </Stack>
  );
}

/** 團隊 as a super admin sees it: every team on the left, the chosen one on the right. */
function SuperTeamsView({ siteUrl }: { siteUrl?: string }) {
  const teamsQuery = useTeams();
  const usersQuery = useAllUsers();
  // `?team=…&member=…`: where approving a new-team application leads (`newTeamHref`).
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string | null>(() =>
    searchParams.get('team'),
  );
  const focusMemberUuid = searchParams.get('member');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const teamTypes = useMemo(() => teamTypesOf(teams), [teams]);
  const counts = useMemo(() => memberCounts(users), [users]);
  const team = teams.find((t) => t.uuid === selected) ?? teams[0];
  const roster = useMemo(
    () => (team ? teamRoster(users, team.uuid, teamTypes) : []),
    [users, team, teamTypes],
  );

  if (teamsQuery.isPending || usersQuery.isPending) {
    return <Typography sx={captionSx}>載入中…</Typography>;
  }
  // A 403 is shown by the shell in place of the page (`isAdminPermissionError`).
  if (teamsQuery.isError || usersQuery.isError) {
    return (
      <Callout tone="danger">
        無法載入團隊或成員資料，請重新整理再試一次。
      </Callout>
    );
  }

  const createDialog = creating ? (
    <CreateTeamDialog
      teams={teams}
      onClose={() => setCreating(false)}
      onCreated={(created) => {
        setSelected(created.uuid);
        setCreating(false);
      }}
    />
  ) : null;

  // Before the first team, the page has no detail to show; it says what a team is instead.
  if (!team) {
    return (
      <>
        <NoTeamsYet onCreate={() => setCreating(true)} />
        {createDialog}
      </>
    );
  }

  const visible = teams.filter((t) => matchesName(t.name, query));

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { mobile: '1fr', desktop: '300px minmax(0, 1fr)' },
        gap: 2.5,
        alignItems: 'start',
      }}
    >
      <Panel
        padding="16px"
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        <Button
          startIcon={<Plus size={17} />}
          onClick={() => setCreating(true)}
          sx={{ width: '100%' }}
        >
          新增團隊
        </Button>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="搜尋團隊…"
          label="搜尋團隊"
        />
        <Stack
          component="nav"
          aria-label="團隊"
          // Stacked above the detail on narrow screens: a long list would push the team out of view.
          sx={{
            gap: '2px',
            maxHeight: { mobile: 320, desktop: 'none' },
            overflowY: { mobile: 'auto', desktop: 'visible' },
          }}
        >
          {visible.length === 0 ? (
            <Typography sx={{ ...captionSx, p: 1.5 }}>
              沒有符合的團隊
            </Typography>
          ) : (
            visible.map((t) => (
              <TeamRailItem
                key={t.uuid}
                team={t}
                count={counts.get(t.uuid) ?? 0}
                active={t.uuid === team.uuid}
                onClick={() => setSelected(t.uuid)}
              />
            ))
          )}
        </Stack>
      </Panel>

      <TeamDetail
        siteUrl={siteUrl}
        team={team}
        teams={teams}
        roster={roster}
        candidates={users}
        teamTypes={teamTypes}
        focusMemberUuid={
          team.uuid === searchParams.get('team') ? focusMemberUuid : null
        }
      />
      {createDialog}
    </Box>
  );
}

interface DirectoryTeam {
  uuid: string;
  name: string;
  type: string;
}

const allTeamsColumn = createColumnHelper<DataTableFeatures, DirectoryTeam>();

/**
 * 所有團隊 (read-only), as the design opens it to every team identity (D-4, 08-17). `/admin/teams`
 * lists only one's own team for a team role, so this reads the directory the user site's
 * application form uses (`roleRequestTeams`, Spec/026): every active team, name and type only.
 * Other teams' rosters and contacts stay closed (ADR-357 point 5).
 */
function AllTeamsTable({ selfTeamUuid }: { selfTeamUuid: string }) {
  const directory = useTeamDirectory();
  const teams = useMemo<DirectoryTeam[]>(
    () =>
      (directory.data?.roleRequestTeams ?? []).map((team) => ({
        ...team,
        type: team.type.toLowerCase(),
      })),
    [directory.data],
  );
  const columns = allTeamsColumn.columns([
    allTeamsColumn.accessor('name', {
      header: '團隊名稱',
      meta: { width: 'minmax(180px, 2fr)' },
      cell: ({ row }) => (
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}
        >
          <Typography
            noWrap
            sx={{ ...typography.label[400], color: color.fg.neutral.default }}
          >
            {row.original.name}
          </Typography>
          {row.original.uuid === selfTeamUuid ? (
            <Badge tone="primary">目前身份</Badge>
          ) : null}
        </Stack>
      ),
    }),
    allTeamsColumn.accessor('type', {
      header: '類型',
      meta: { width: '120px' },
      cell: ({ getValue }) => <TeamTypeBadge type={getValue()} />,
    }),
  ]);

  if (directory.isPending) {
    return <Typography sx={captionSx}>載入中…</Typography>;
  }
  if (directory.isError) {
    return (
      <Callout tone="danger">無法載入團隊目錄，請重新整理再試一次。</Callout>
    );
  }

  return (
    <Stack sx={{ gap: 2 }}>
      <Callout tone="info">
        <b>唯讀 —— 只有團隊名稱與類型</b>
        <br />
        供劃區、轉介與跨隊聯繫時挑選對象。依個資原則，別隊的成員名單與成員電話一律不顯示。
      </Callout>
      <DataTable
        columns={columns}
        data={teams}
        getRowId={(row) => row.uuid}
        getRowSx={(row) => ({
          bgcolor:
            row.uuid === selfTeamUuid ? color.bg.primary.subtle : undefined,
        })}
      />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
        <Box
          component={Lock}
          sx={{ width: 14, height: 14, color: color.fg.neutral.muted }}
        />
        <Typography sx={captionSx}>
          成員名單僅該隊的管理員與超級管理員可見。
        </Typography>
      </Stack>
    </Stack>
  );
}

/**
 * 我的團隊: the team of the acting identity, as its admin or one of its members. What each tab
 * needs is a capability of the team role (Spec/026): the roster `team.member.view`, managing it
 * and the queue `team.member.manage`, editing `team.edit`, the log `team.audit.view`.
 */
function MyTeamView({
  teamUuid,
  teamName,
  isAdmin,
  selfUuid,
  can,
  siteUrl,
}: {
  teamUuid: string;
  teamName: string;
  isAdmin: boolean;
  selfUuid: string;
  can: (perm: Perm) => boolean;
  siteUrl?: string;
}) {
  const teamsQuery = useTeams();
  const canManage = can('team.member.manage');
  const membersQuery = useTeamMembers(teamUuid, {
    enabled: can('team.member.view'),
  });
  const pendingRequests = usePendingRoleRequests(teamUuid, {
    enabled: canManage,
  });
  const [tab, setTab] = useState('members');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const team: Team = teams.find((t) => t.uuid === teamUuid) ?? {
    uuid: teamUuid,
    name: teamName,
    type: '',
    status: 'active',
  };
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const roster = useMemo(() => rosterFromMembers(members), [members]);
  const roles = useMemo(
    () => members.map((m) => ({ uuid: m.role_uuid, name: m.role })),
    [members],
  );
  const { actionsFor, dialogs } = useRosterActions(team, roster);
  const queueCount = pendingRequests.data?.length ?? 0;

  const tabs = [
    { value: 'members', label: isAdmin ? '成員列表' : '夥伴列表' },
    ...(canManage
      ? [
          {
            value: 'queue',
            label: (
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                審核佇列
                {queueCount > 0 ? (
                  <CountBadge count={queueCount} tone="warning" />
                ) : null}
              </Stack>
            ),
          },
        ]
      : []),
    ...(can('team.audit.view') ? [{ value: 'audit', label: '團隊紀錄' }] : []),
    { value: 'all', label: '所有團隊' },
  ];

  return (
    <Stack sx={{ gap: 2 }}>
      <Panel sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}
        >
          <Stack sx={{ flex: 1, minWidth: 220, gap: 1 }}>
            <Stack
              direction="row"
              sx={{ alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}
            >
              <Typography
                component="h2"
                sx={{ ...typography.heading[600], m: 0 }}
              >
                {team.name}
              </Typography>
              {team.type ? <TeamTypeBadge type={team.type} /> : null}
              <Badge tone={isAdmin ? 'primary' : 'neutral'}>
                {isAdmin ? '我是管理員' : '我是成員'}
              </Badge>
            </Stack>
            <TeamFacts team={team} />
            <Typography sx={captionSx}>
              {isAdmin
                ? '您可邀請與調整本隊成員的團隊角色。別隊的成員名單看不到，也無法變更任何人的平台角色。'
                : '您在此團隊的角色是成員 —— 僅能檢視夥伴基本資訊；成員管理與團隊紀錄只有管理員看得到。'}
            </Typography>
          </Stack>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
          >
            {can('team.edit') && teamsQuery.isSuccess ? (
              <Button
                variant="outline"
                startIcon={<Pencil size={16} />}
                onClick={() => setEditing(true)}
              >
                編輯團隊資料
              </Button>
            ) : null}
            {canManage ? (
              <Button
                startIcon={<QrCode size={17} />}
                onClick={() => setInviting(true)}
              >
                邀請成員
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </Panel>

      <Tabs
        value={tab}
        onChange={(_, value: string) => setTab(value)}
        variant="scrollable"
      >
        {tabs.map((item) => (
          <Tab key={item.value} value={item.value} label={item.label} />
        ))}
      </Tabs>

      {tab === 'members' ? (
        membersQuery.isPending ? (
          <Typography sx={captionSx}>載入中…</Typography>
        ) : membersQuery.isError ? (
          <Callout tone="danger">
            無法載入本隊名單，請重新整理再試一次。
          </Callout>
        ) : (
          <MemberTable
            rows={roster}
            selfUuid={selfUuid}
            basic
            actionsFor={canManage ? actionsFor : undefined}
            empty={
              <EmptyState
                icon={<Users />}
                title="尚無成員"
                description={
                  canManage
                    ? '用「邀請成員」產生 QR，讓夥伴掃碼申請加入。'
                    : '管理員核准加入申請後，夥伴會列在這裡。'
                }
              />
            }
          />
        )
      ) : null}
      {tab === 'queue' ? (
        <Stack sx={{ gap: 1.5 }}>
          <Typography sx={captionSx}>
            加入「{team.name}」的申請與成員邀請 QR
            掃碼皆在此把關；核准後以成員身份加入。
          </Typography>
          <RoleRequestQueue teamUuid={team.uuid} />
        </Stack>
      ) : null}
      {tab === 'audit' ? (
        <AuditLog users={members} teams={teams} roles={roles} />
      ) : null}
      {tab === 'all' ? <AllTeamsTable selfTeamUuid={team.uuid} /> : null}

      {dialogs}
      {inviting ? (
        <InviteSheet
          team={team}
          siteUrl={siteUrl}
          onClose={() => setInviting(false)}
        />
      ) : null}
      {editing ? (
        <EditTeamDialog
          team={team}
          teams={teams}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Stack>
  );
}

function TeamsView({ siteUrl }: { siteUrl?: string }) {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) {
    return <Typography sx={captionSx}>載入中…</Typography>;
  }
  const can = (perm: Perm) => user?.capabilities.includes(perm) ?? false;
  const identity = user?.active_identity;
  // Capabilities carry no scope, and a team admin now holds `team.edit` for their own team
  // (ADR-357): the platform view is for an identity that is not a team's.
  if (identity?.team_uuid && can('team.view')) {
    return (
      <MyTeamView
        siteUrl={siteUrl}
        teamUuid={identity.team_uuid}
        teamName={identity.team ?? ''}
        isAdmin={identity.role === 'admin'}
        selfUuid={user?.uuid ?? ''}
        can={can}
      />
    );
  }
  if (can('team.edit')) {
    return <SuperTeamsView siteUrl={siteUrl} />;
  }
  // A platform identity with team.view but neither a team nor team.edit: the nav already hides
  // 團隊 from anyone without team.view, so this is only a guard.
  return <AdminErrorPage code="403" />;
}

export function TeamsPage({ siteUrl }: { siteUrl?: string }) {
  return (
    <PageFrame>
      {/* `useSearchParams` (SuperTeamsView) needs a boundary, or the route cannot prerender. */}
      <Suspense fallback={<Typography sx={captionSx}>載入中…</Typography>}>
        <TeamsView siteUrl={siteUrl} />
      </Suspense>
    </PageFrame>
  );
}
