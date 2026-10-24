'use client';

import { Users } from 'lucide-react';

import { Stack, Typography } from '@mui/material';
import { createColumnHelper } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import {
  Avatar,
  Badge,
  DataTable,
  designTokens,
  EmptyState,
  type DataTableFeatures,
} from '@rescue-frontend/ui';

import { NeedActionsMenu } from '../../ticket/needs/need-actions-menu';
import type { NeedAction } from '../../ticket/needs/need-actions';
import { PlatformBadge, TeamRoleBadge } from './badges';
import { captionSx, formatDateTime } from './parts';
import type { RosterMember } from './roster';

const { color, typography } = designTokens;

const column = createColumnHelper<DataTableFeatures, RosterMember>();

export function PersonCell({
  name,
  self,
  extra,
}: {
  name: string;
  self?: boolean;
  extra?: ReactNode;
}) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Avatar name={name} size={34} tone="neutral" />
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}
      >
        <Typography
          noWrap
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          {name}
        </Typography>
        {self ? <Badge>我</Badge> : null}
        {extra}
      </Stack>
    </Stack>
  );
}

/** The name confirmed on approval, beside the nickname when the two differ (ADR-355). */
export function RealName({
  name,
  realName,
}: {
  name: string;
  realName: string | null;
}) {
  if (!realName || realName === name) return null;
  return (
    <Typography noWrap sx={{ ...captionSx, flexShrink: 1, minWidth: 0 }}>
      （實名 {realName}）
    </Typography>
  );
}

/**
 * A team's roster (the prototype's `MemberTable`). `basic` leaves out what a team identity
 * cannot know — platform role and last activity — and shows who and which role. `actionsFor`
 * returns the ⋯ menu of a row; without it there is no menu column.
 */
export function MemberTable({
  rows,
  selfUuid,
  basic = false,
  actionsFor,
  empty,
}: {
  rows: readonly RosterMember[];
  selfUuid?: string;
  basic?: boolean;
  actionsFor?: (member: RosterMember) => NeedAction[];
  empty?: ReactNode;
}) {
  const columns = column.columns([
    column.accessor('name', {
      header: '成員',
      meta: { width: 'minmax(180px, 2fr)' },
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
    column.accessor('role', {
      header: '團隊角色',
      meta: { width: '110px' },
      cell: ({ getValue }) => <TeamRoleBadge role={getValue()} />,
    }),
    ...(basic
      ? []
      : [
          column.accessor('platform', {
            header: '平台角色',
            meta: { width: '120px' },
            cell: ({ getValue }) => {
              const platform = getValue();
              return platform ? <PlatformBadge platform={platform} /> : null;
            },
          }),
          column.accessor('lastActivityAt', {
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
        ]),
    ...(actionsFor
      ? [
          column.display({
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
        ]
      : []),
  ]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.uuid}
      // An empty roster has only its message to show, which a scrolling minimum would cut off.
      minWidth={basic || rows.length === 0 ? undefined : 640}
      empty={
        empty ?? (
          <EmptyState
            icon={<Users />}
            title="尚無成員"
            description="把夥伴加入本隊後，會列在這裡。"
          />
        )
      }
    />
  );
}
