'use client';

import { Users } from 'lucide-react';

import {
  Box,
  Stack,
  type Theme,
  Typography,
  useMediaQuery,
} from '@mui/material';
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

const { color, radius, typography } = designTokens;

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

export interface PersonCard {
  id: string;
  name: string;
  realName: string | null;
  self?: boolean;
  highlighted?: boolean;
  actions?: NeedAction[];
  lastActivityAt?: string | null;
  badges: ReactNode;
  /** Anything longer than a badge row, such as the teams someone belongs to. */
  detail?: ReactNode;
}

/**
 * A people table on desktop, one card per person below it: a table scrolled sideways would
 * leave the ⋯ menu off screen, and that menu is how a phone promotes or removes someone.
 */
export function ResponsivePeople({
  table,
  cards,
}: {
  table: ReactNode;
  cards: readonly PersonCard[];
}) {
  const isWide = useMediaQuery((theme: Theme) =>
    theme.breakpoints.up('desktop'),
  );

  if (isWide || cards.length === 0) return table;
  return (
    <Stack
      sx={{
        bgcolor: color.bg.neutral.default,
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.lg}px`,
        overflow: 'hidden',
      }}
    >
      {cards.map((card, index) => (
        <Stack
          key={card.id}
          sx={{
            gap: 1,
            p: 2,
            borderTop:
              index === 0 ? 'none' : `1px solid ${color.border.default}`,
            bgcolor: card.highlighted ? color.bg.primary.subtle : undefined,
          }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PersonCell
                name={card.name}
                self={card.self}
                extra={<RealName name={card.name} realName={card.realName} />}
              />
            </Box>
            {card.actions ? (
              <NeedActionsMenu needName={card.name} items={card.actions} />
            ) : null}
          </Stack>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
          >
            {card.badges}
            {card.lastActivityAt ? (
              <Typography sx={captionSx}>
                最後活動 {formatDateTime(card.lastActivityAt)}
              </Typography>
            ) : null}
          </Stack>
          {card.detail}
        </Stack>
      ))}
    </Stack>
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
  highlightUuid,
  basic = false,
  actionsFor,
  empty,
}: {
  rows: readonly RosterMember[];
  selfUuid?: string;
  /** A row to mark, e.g. the person a review just added. */
  highlightUuid?: string | null;
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

  const table = (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.uuid}
      getRowSx={(row) =>
        row.uuid === highlightUuid ? { bgcolor: color.bg.primary.subtle } : {}
      }
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
  if (rows.length === 0) return table;

  return (
    <ResponsivePeople
      table={table}
      cards={rows.map((member) => ({
        id: member.uuid,
        name: member.name,
        realName: member.realName,
        self: member.uuid === selfUuid,
        highlighted: member.uuid === highlightUuid,
        actions: actionsFor?.(member),
        lastActivityAt: basic ? null : member.lastActivityAt,
        badges: (
          <>
            <TeamRoleBadge role={member.role} />
            {!basic && member.platform ? (
              <PlatformBadge platform={member.platform} />
            ) : null}
          </>
        ),
      }))}
    />
  );
}
