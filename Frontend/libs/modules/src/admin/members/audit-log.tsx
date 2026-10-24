'use client';

import {
  Building2,
  FileText,
  Inbox,
  QrCode,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Box, Chip, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';

import { useAuditLogs } from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  EmptyState,
} from '@rescue-frontend/ui';

import {
  AUDIT_CATEGORY_TABLE,
  describeAuditEntry,
  MEMBER_AUDIT_TABLES,
  type AuditCategory,
  type AuditLookups,
} from './audit';
import { captionSx, formatDateTime, Panel } from './parts';

const { color, typography } = designTokens;

type Filter = keyof typeof AUDIT_CATEGORY_TABLE | 'all';

const CATEGORIES: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'team', label: '團隊異動' },
  { id: 'member', label: '成員與角色' },
  { id: 'request', label: '申請審核' },
  { id: 'qr', label: 'QR 邀請' },
];

const CATEGORY_ICON: Record<AuditCategory, LucideIcon> = {
  team: Building2,
  member: Users,
  request: Inbox,
  qr: QrCode,
  other: FileText,
};

interface Named {
  uuid: string;
  name: string;
}

/**
 * 操作紀錄 (super admin: the whole platform) / 團隊紀錄 (team admin: the backend returns only
 * rows about the acting team, ADR-358). The names it can show are the ones the page loaded:
 * `users` and `teams` for who and where, `roles` for which role a grant handed out.
 */
export function AuditLog({
  users,
  teams,
  roles,
}: {
  users: readonly Named[];
  teams: readonly Named[];
  roles: readonly Named[];
}) {
  const [category, setCategory] = useState<Filter>('all');
  const logs = useAuditLogs(
    category === 'all' ? {} : { table: AUDIT_CATEGORY_TABLE[category] },
  );

  const lookups = useMemo<AuditLookups>(() => {
    const index = (rows: readonly Named[]) =>
      new Map(rows.map((row) => [row.uuid, row.name]));
    const userNames = index(users);
    const teamNames = index(teams);
    const roleNames = index(roles);
    return {
      userName: (uuid) => userNames.get(uuid),
      teamName: (uuid) => teamNames.get(uuid),
      roleName: (uuid) => roleNames.get(uuid),
    };
  }, [users, teams, roles]);

  const entries = useMemo(
    () =>
      (logs.data?.pages.flat() ?? [])
        // 全部 is still about people and teams; tickets and stations have their own history.
        .filter((item) => MEMBER_AUDIT_TABLES.has(item.table_name))
        .map((item) => describeAuditEntry(item, lookups)),
    [logs.data, lookups],
  );

  return (
    <Stack sx={{ gap: 1.75 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      >
        {CATEGORIES.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            color={category === item.id ? 'primary' : 'default'}
            variant={category === item.id ? 'filled' : 'outlined'}
            onClick={() => setCategory(item.id)}
            aria-pressed={category === item.id}
          />
        ))}
      </Stack>
      {logs.isPending ? (
        <Typography sx={captionSx}>載入中…</Typography>
      ) : logs.isError ? (
        <Callout tone="danger">無法載入操作紀錄，請重新整理再試一次。</Callout>
      ) : (
        <Panel padding="0">
          {entries.length === 0 ? (
            <EmptyState
              icon={<ScrollText />}
              title="此範圍內沒有紀錄"
              description="建立或暫停團隊、成員加入或移出、指派平台角色、產生邀請 QR，都會自動記在這裡，誰在什麼時候做的一目了然。"
            />
          ) : (
            entries.map((entry) => {
              const Icon = CATEGORY_ICON[entry.category];
              return (
                <Stack
                  key={entry.uuid}
                  direction="row"
                  sx={{
                    alignItems: 'flex-start',
                    gap: 1.75,
                    p: '14px 16px',
                    borderBottom: `1px solid ${color.border.default}`,
                    '&:last-of-type': { borderBottom: 'none' },
                  }}
                >
                  <Typography
                    sx={{
                      ...typography.data[300],
                      width: 88,
                      flexShrink: 0,
                      pt: '6px',
                      color: color.fg.neutral.muted,
                    }}
                  >
                    {formatDateTime(entry.at)}
                  </Typography>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      bgcolor: entry.danger
                        ? color.bg.danger.subtle
                        : color.bg.neutral.subtle,
                      color: entry.danger
                        ? color.fg.danger
                        : color.fg.neutral.subtle,
                    }}
                  >
                    <Icon size={15} />
                  </Box>
                  <Typography
                    sx={{
                      ...typography.body[300],
                      flex: 1,
                      minWidth: 0,
                      pt: '5px',
                      color: color.fg.neutral.default,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <Box component="b" sx={{ mr: 1.5 }}>
                      {entry.actor}
                    </Box>
                    {entry.action}
                  </Typography>
                  <Badge
                    tone={entry.teamName ? 'info' : 'neutral'}
                    sx={{ flexShrink: 0, mt: '4px' }}
                  >
                    {entry.teamName ?? '平台'}
                  </Badge>
                </Stack>
              );
            })
          )}
        </Panel>
      )}
      {logs.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={logs.isFetchingNextPage}
          onClick={() => void logs.fetchNextPage()}
          sx={{ alignSelf: 'center' }}
        >
          {logs.isFetchingNextPage ? '載入中…' : '載入更早的紀錄'}
        </Button>
      ) : null}
    </Stack>
  );
}
