'use client';

import { SearchX, ShieldAlert, UserPlus } from 'lucide-react';

import { Box, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import {
  useAllUsers,
  useAssignUserRole,
  useCurrentUser,
  usePermissionMatrix,
  useRevokeUserSessions,
  useTeams,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import {
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
import { AuditLog } from './audit-log';
import { PlatformBadge, platformLabel, TeamRoleBadge } from './badges';
import { AssignRoleDialog, BlockDialog } from './dialogs';
import { PersonCell, RealName } from './member-table';
import { captionSx, formatDateTime, PageFrame, SearchField } from './parts';
import { RoleRequestQueue, usePendingRoleRequests } from './queue';
import {
  directory,
  matchesName,
  platformOf,
  platformStaff,
  superAdminCount,
  teamTypesOf,
  type AdminUser,
  type DirectoryPerson,
  type PlatformKey,
} from './roster';

const { color, typography } = designTokens;

type Perm = components['schemas']['Perm'];

const LAST_SUPER_RULE = '平台角色不變量 —— 平台必須至少保留 1 位超級管理員';

interface PersonActions {
  actionsFor: (person: {
    uuid: string;
    name: string;
    platform: PlatformKey;
  }) => NeedAction[];
  dialogs: ReactElement;
}

/**
 * The ⋯ of a person: change their platform role, or sign them out of every device (BE-022).
 * The backend refuses to sign out a super admin, so that entry is left off for them.
 */
function usePersonActions(
  users: readonly AdminUser[],
  withRoles: boolean,
): PersonActions {
  const assignRole = useAssignUserRole();
  const revokeSessions = useRevokeUserSessions();
  const [blocked, setBlocked] = useState<string | null>(null);
  const [revokingSuper, setRevokingSuper] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  const [signingOut, setSigningOut] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  const supers = superAdminCount(users);

  const assign = (
    person: { uuid: string; name: string },
    role: 'super_admin' | 'data_auditor',
  ) =>
    assignRole.mutate(
      {
        params: { path: { user_uuid: person.uuid } },
        body: { role_name: role },
      },
      {
        onSuccess: () => {
          toast.success(
            role === 'super_admin'
              ? `已指派 ${person.name} 為超級管理員`
              : `已撤銷 ${person.name} 的超級管理員`,
          );
          setRevokingSuper(null);
        },
      },
    );

  const actionsFor: PersonActions['actionsFor'] = (person) => [
    ...(withRoles && person.platform === 'data_auditor'
      ? [
          {
            label: '指派為超級管理員',
            onSelect: () => assign(person, 'super_admin'),
          },
        ]
      : []),
    ...(withRoles && person.platform === 'super_admin'
      ? [
          {
            label: '撤銷超級管理員',
            tone: 'danger' as const,
            onSelect: () =>
              supers <= 1 ? setBlocked(person.name) : setRevokingSuper(person),
          },
        ]
      : []),
    ...(person.platform === 'super_admin'
      ? []
      : [
          {
            label: '強制登出',
            tone: 'danger' as const,
            onSelect: () => setSigningOut(person),
          },
        ]),
  ];

  const dialogs = (
    <>
      {blocked ? (
        <BlockDialog
          title="無法執行此操作"
          body={`${blocked} 是平台目前唯一一位超級管理員。請先指派另一位超級管理員接班，才能撤銷。`}
          rule={LAST_SUPER_RULE}
          onClose={() => setBlocked(null)}
        />
      ) : null}
      {revokingSuper ? (
        <Dialog
          open
          title={`撤銷 ${revokingSuper.name} 的超級管理員`}
          confirmLabel="確認撤銷"
          confirmTone="danger"
          submitting={assignRole.isPending}
          onClose={() => setRevokingSuper(null)}
          onConfirm={() => assign(revokingSuper, 'data_auditor')}
        >
          <Typography
            sx={{ ...typography.body[400], color: color.fg.neutral.default }}
          >
            撤銷後改為{platformLabel('data_auditor')}
            ，保留全域檢核的工作，但不再能管理成員與權限。
          </Typography>
        </Dialog>
      ) : null}
      {signingOut ? (
        <Dialog
          open
          title={`強制登出 ${signingOut.name}`}
          confirmLabel="強制登出"
          confirmTone="danger"
          confirmIcon={<ShieldAlert size={16} />}
          submitting={revokeSessions.isPending}
          onClose={() => setSigningOut(null)}
          onConfirm={() =>
            revokeSessions.mutate(
              { params: { path: { user_uuid: signingOut.uuid } } },
              {
                onSuccess: () => {
                  toast.success(`已將 ${signingOut.name} 從所有裝置登出`);
                  setSigningOut(null);
                },
              },
            )
          }
        >
          <Typography
            sx={{ ...typography.body[400], color: color.fg.neutral.default }}
          >
            {signingOut.name}{' '}
            在所有裝置上的登入會立即失效，需要重新登入。帳號、角色與團隊都不受影響。
          </Typography>
        </Dialog>
      ) : null}
    </>
  );

  return { actionsFor, dialogs };
}

const staffColumn = createColumnHelper<DataTableFeatures, AdminUser>();

/** 平台級人員: the global roles no team grants — super admins and data auditors. */
function PlatformStaff({
  users,
  teamTypes,
  selfUuid,
}: {
  users: readonly AdminUser[];
  teamTypes: ReadonlyMap<string, string>;
  selfUuid?: string;
}) {
  const [assigning, setAssigning] = useState(false);
  const { actionsFor, dialogs } = usePersonActions(users, true);
  const rows = useMemo(() => platformStaff(users), [users]);

  const columns = staffColumn.columns([
    staffColumn.accessor('name', {
      header: '成員',
      meta: { width: 'minmax(200px, 2fr)' },
      cell: ({ row }) => (
        <PersonCell
          name={row.original.name}
          self={row.original.uuid === selfUuid}
          extra={
            <RealName
              name={row.original.name}
              realName={row.original.real_name ?? null}
            />
          }
        />
      ),
    }),
    staffColumn.display({
      id: 'platform',
      header: '平台角色',
      meta: { width: '130px' },
      cell: ({ row }) => (
        <PlatformBadge platform={platformOf(row.original, teamTypes)} />
      ),
    }),
    staffColumn.accessor('last_activity_at', {
      header: '最後活動',
      meta: { width: '130px' },
      cell: ({ getValue }) => (
        <Typography
          sx={{ ...typography.data[300], color: color.fg.neutral.subtle }}
        >
          {formatDateTime(getValue())}
        </Typography>
      ),
    }),
    staffColumn.display({
      id: 'actions',
      header: '',
      meta: { width: '44px', align: 'right' },
      cell: ({ row }) => (
        <NeedActionsMenu
          needName={row.original.name}
          items={actionsFor({
            uuid: row.original.uuid,
            name: row.original.name,
            platform: platformOf(row.original, teamTypes),
          })}
        />
      ),
    }),
  ]);

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Typography sx={{ ...captionSx, flex: 1, minWidth: 240 }}>
          {platformLabel('super_admin')}與{platformLabel('data_auditor')}
          的工作是全域的，不需靠團隊管理成員 ——
          此分頁只是把「不由團隊推導的全域角色」集中呈現，並非一種團隊。
        </Typography>
        <Button
          size="sm"
          variant="outline"
          startIcon={<UserPlus size={15} />}
          onClick={() => setAssigning(true)}
        >
          指派平台級角色
        </Button>
      </Stack>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.uuid}
        minWidth={560}
      />
      {dialogs}
      {assigning ? (
        <AssignRoleDialog
          users={users}
          teamTypes={teamTypes}
          onClose={() => setAssigning(false)}
        />
      ) : null}
    </Stack>
  );
}

const FILTERS: { id: PlatformKey | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  ...(['super_admin', 'gov', 'ngo', 'data_auditor', 'user'] as const).map(
    (id) => ({
      id,
      label: platformLabel(id),
    }),
  ),
];

const directoryColumn = createColumnHelper<
  DataTableFeatures,
  DirectoryPerson
>();

/** 全平台人員: who someone is, their platform role, and which teams they are in. */
function PeopleDirectory({
  users,
  teamTypes,
  selfUuid,
}: {
  users: readonly AdminUser[];
  teamTypes: ReadonlyMap<string, string>;
  selfUuid?: string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlatformKey | 'all'>('all');
  const { actionsFor, dialogs } = usePersonActions(users, false);
  const people = useMemo(() => directory(users, teamTypes), [users, teamTypes]);
  const rows = people.filter(
    (person) =>
      (filter === 'all' || person.platform === filter) &&
      (matchesName(person.name, query) ||
        (person.realName !== null && matchesName(person.realName, query))),
  );

  const columns = directoryColumn.columns([
    directoryColumn.accessor('name', {
      header: '人員',
      meta: { width: 'minmax(180px, 1.6fr)' },
      cell: ({ row }) => (
        <PersonCell
          name={row.original.name}
          self={row.original.uuid === selfUuid}
          extra={
            <RealName
              name={row.original.name}
              realName={row.original.realName}
            />
          }
        />
      ),
    }),
    directoryColumn.accessor('platform', {
      header: '平台角色',
      meta: { width: '130px' },
      cell: ({ getValue }) => <PlatformBadge platform={getValue()} />,
    }),
    directoryColumn.accessor('teams', {
      header: '所屬團隊（角色）',
      meta: { width: 'minmax(220px, 2fr)' },
      cell: ({ getValue }) =>
        getValue().length === 0 ? (
          <Typography sx={captionSx}>—</Typography>
        ) : (
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
            {getValue().map((membership) => (
              <Stack
                key={membership.teamUuid}
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: 0.75,
                  height: 26,
                  pl: '10px',
                  pr: '8px',
                  borderRadius: '999px',
                  bgcolor: color.bg.neutral.subtle,
                  border: `1px solid ${color.border.default}`,
                }}
              >
                <Typography
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.subtle,
                  }}
                >
                  {membership.teamName}
                </Typography>
                <TeamRoleBadge role={membership.role} />
              </Stack>
            ))}
          </Stack>
        ),
    }),
    directoryColumn.accessor('lastActivityAt', {
      header: '最後活動',
      meta: { width: '110px' },
      cell: ({ getValue }) => (
        <Typography
          sx={{ ...typography.data[300], color: color.fg.neutral.subtle }}
        >
          {formatDateTime(getValue())}
        </Typography>
      ),
    }),
    directoryColumn.display({
      id: 'actions',
      header: '',
      meta: { width: '44px', align: 'right' },
      cell: ({ row }) => (
        <NeedActionsMenu
          needName={row.original.name}
          items={actionsFor(row.original)}
        />
      ),
    }),
  ]);

  return (
    <Stack sx={{ gap: 1.75 }}>
      <Typography sx={captionSx}>
        跨團隊的唯讀人員目錄 ——
        查詢任一人的平台身份與所屬團隊。變更平台角色須回到「平台級人員」刻意指派；
        團隊角色由各隊的管理員於「團隊」頁調整。
      </Typography>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}
      >
        <Box sx={{ flex: '0 1 320px', minWidth: 220 }}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="搜尋姓名…"
            label="搜尋人員"
          />
        </Box>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {FILTERS.map((item) => (
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
        <Box sx={{ flex: 1 }} />
        <Typography sx={captionSx}>{rows.length} 人</Typography>
      </Stack>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.uuid}
        minWidth={720}
        empty={
          <EmptyState
            icon={<SearchX />}
            title="查無符合的人員"
            description="試試其他姓名或調整篩選條件。"
          />
        }
      />
      {dialogs}
    </Stack>
  );
}

/** 成員與權限 (super admin only; the sidebar hides it from everyone else). */
function MembersPermissionsView() {
  const { data: currentUser, isPending: userPending } = useCurrentUser();
  const can = (perm: Perm) => currentUser?.capabilities.includes(perm) ?? false;
  const allowed = can('rbac.assign');
  const usersQuery = useAllUsers({ enabled: allowed });
  const teamsQuery = useTeams({ enabled: allowed });
  const pendingRequests = usePendingRoleRequests(undefined, {
    enabled: allowed,
  });
  // Only to name the role an audit entry granted; the log reads fine without it.
  const matrixQuery = usePermissionMatrix({
    enabled: allowed && can('rbac.view'),
  });
  const [tab, setTab] = useState('platform');
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const teamTypes = useMemo(
    () => teamTypesOf(teamsQuery.data ?? []),
    [teamsQuery.data],
  );
  const roles = useMemo(
    () => matrixQuery.data?.roles ?? [],
    [matrixQuery.data],
  );
  const queueCount = pendingRequests.data?.length ?? 0;

  if (userPending) return <Typography sx={captionSx}>載入中…</Typography>;
  // The nav hides 成員與權限 without rbac.assign, and the shell shows any 403 a query earns;
  // this guards a direct visit.
  if (!allowed) return <AdminErrorPage code="403" />;

  const tabs = [
    { value: 'platform', label: '平台級人員' },
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
    { value: 'directory', label: '全平台人員' },
    ...(can('audit.view') ? [{ value: 'audit', label: '操作紀錄' }] : []),
  ];

  const peopleTab = tab === 'platform' || tab === 'directory';
  const body = !peopleTab ? null : usersQuery.isPending ||
    teamsQuery.isPending ? (
    <Typography sx={captionSx}>載入中…</Typography>
  ) : usersQuery.isError || teamsQuery.isError ? (
    <Callout tone="danger">無法載入人員資料，請重新整理再試一次。</Callout>
  ) : tab === 'platform' ? (
    <PlatformStaff
      users={users}
      teamTypes={teamTypes}
      selfUuid={currentUser?.uuid}
    />
  ) : (
    <PeopleDirectory
      users={users}
      teamTypes={teamTypes}
      selfUuid={currentUser?.uuid}
    />
  );

  return (
    <Stack sx={{ gap: 2.25 }}>
      <Tabs
        value={tab}
        onChange={(_, value: string) => setTab(value)}
        variant="scrollable"
      >
        {tabs.map((item) => (
          <Tab key={item.value} value={item.value} label={item.label} />
        ))}
      </Tabs>
      {tab === 'queue' ? (
        <Stack sx={{ gap: 1.5 }}>
          <Typography sx={captionSx}>
            所有待審的申請都在這裡：加入既有團隊（該隊的管理員也能審）、建立新團隊與
            {platformLabel('data_auditor')}
            （只有超級管理員能審）。誰先決定就算數，另一邊會看到已處理。
          </Typography>
          <RoleRequestQueue />
        </Stack>
      ) : null}
      {tab === 'audit' ? (
        <AuditLog users={users} teams={teamsQuery.data ?? []} roles={roles} />
      ) : null}
      {body}
    </Stack>
  );
}

export function MembersPermissionsPage() {
  return (
    <PageFrame>
      <MembersPermissionsView />
    </PageFrame>
  );
}
