'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Building2,
  CheckCheck,
  ClipboardCheck,
  Copy,
  Flag,
  Inbox,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import {
  Button,
  designTokens,
  EmptyState,
  SheetFrame,
  SheetLayout,
  Tag,
} from '@rescue-frontend/ui';

import {
  groupAdminNotices,
  ADMIN_NOTICE_GROUPS,
  readAdminNotices,
  type AdminNotice,
  type AdminNoticeGroup,
  type AdminNoticeKind,
} from './admin-notices';
import {
  adminNotificationKeys,
  listNotificationsAsync,
  siteNotificationKeys,
} from './api';
import { readsNextPageUnasked } from './site-notices';
import { useMarkNotificationsRead } from './use-mark-notifications-read';

const { color, iconSize, primitives, radius, typography } = designTokens;

/** Screen-reader-only text. `@mui/utils` is not a direct dependency, so the same recipe lives here. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  m: '-1px',
  p: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** The sheet's own body padding (`flushBody` hands it to the content): 16px on mobile, 24px above. */
const BODY_PADDING = { mobile: 2, tablet: 3 } as const;

// The caption under the title returns when the bell's number ships; until then staff never see the
// number it explains. Kept as-is so it can be restored:
// 開啟這份清單只會清掉鈴鐺上的數字，不會把任何一則標成已讀。

type Tone = 'warning' | 'info' | 'neutral';

/** Each kind's label, icon and colour (prototype `TYPES`). */
const KIND_LOOKS: Record<
  AdminNoticeKind,
  { label: string; Icon: LucideIcon; tone: Tone; fg: string }
> = {
  suggestion: {
    label: '站點修改建議',
    Icon: ClipboardCheck,
    tone: 'warning',
    fg: color.fg.warning,
  },
  dedup: {
    label: '疑似重複',
    Icon: Copy,
    tone: 'warning',
    fg: color.fg.warning,
  },
  role: {
    label: '權限申請',
    Icon: UserPlus,
    tone: 'warning',
    fg: color.fg.warning,
  },
  assign: { label: '指派', Icon: Flag, tone: 'info', fg: color.fg.info },
  team: { label: '團隊', Icon: Users, tone: 'info', fg: color.fg.info },
  station: {
    label: '站點動態',
    Icon: Building2,
    tone: 'neutral',
    fg: color.fg.neutral.subtle,
  },
};

const GROUP_COLORS: Record<AdminNoticeGroup, string> = {
  act: color.fg.warning,
  team: color.fg.neutral.subtle,
};

const EMPTY_REASONS: { kind: AdminNoticeKind; text: string }[] = [
  { kind: 'suggestion', text: '站點有修改建議待你審核' },
  { kind: 'dedup', text: '有資料疑似重複，待審核' },
  { kind: 'role', text: '有人申請管理權限' },
  { kind: 'assign', text: '站點、責任區指派給你的團隊' },
  { kind: 'team', text: '加入團隊、團隊暫停' },
];

function Line({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        ...typography.body[300],
        py: 4,
        px: 2,
        textAlign: 'center',
        color: color.fg.neutral.subtle,
      }}
    >
      {children}
    </Typography>
  );
}

/** One notice (prototype `NotifyRow`): bold and shaded until read. */
function NoticeRow({
  notice,
  onOpen,
}: {
  notice: AdminNotice;
  onOpen: (notice: AdminNotice) => void;
}) {
  const look = KIND_LOOKS[notice.kind];
  const unread = !notice.read;

  return (
    <ButtonBase
      onClick={() => onOpen(notice)}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: '12px',
        width: '100%',
        p: '14px 16px',
        textAlign: 'left',
        borderBottom: `1px solid ${color.bg.neutral.sunken}`,
        bgcolor: unread ? color.bg.info.subtle : 'transparent',
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.neutral.subtle,
          color: look.fg,
        }}
      >
        <look.Icon size={iconSize.md} aria-hidden />
      </Box>
      <Stack sx={{ flex: 1, minWidth: 0, gap: '4px' }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: '7px' }}>
          <Tag tone={look.tone} size="sm">
            {look.label}
          </Tag>
          {notice.ago ? (
            <Typography
              sx={{
                ...typography.data[300],
                ml: 'auto',
                whiteSpace: 'nowrap',
                color: color.fg.neutral.muted,
              }}
            >
              {notice.ago}
            </Typography>
          ) : null}
        </Stack>
        {unread ? (
          <Box component="span" sx={VISUALLY_HIDDEN}>
            未讀
          </Box>
        ) : null}
        <Typography
          sx={{
            ...typography.body[400],
            fontWeight: unread
              ? primitives.fontWeight.bold
              : primitives.fontWeight.regular,
            color: color.fg.neutral.default,
            overflowWrap: 'anywhere',
          }}
        >
          {notice.summary}
        </Typography>
        {notice.detail ? (
          <Typography
            sx={{
              ...typography.body[300],
              color: color.fg.neutral.muted,
              overflowWrap: 'anywhere',
            }}
          >
            {notice.detail}
          </Typography>
        ) : null}
      </Stack>
      {unread ? (
        <Box
          aria-hidden
          sx={{
            width: 9,
            height: 9,
            flexShrink: 0,
            mt: '12px',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.default,
          }}
        />
      ) : null}
    </ButtonBase>
  );
}

/**
 * Nothing yet (prototype `WGNotifyEmpty`): what the list is for and what will bring something, with
 * each kind's own icon so the first notice is recognised. No button: notices come from what others do.
 */
function AdminNotifyEmpty() {
  return (
    <Box role="status">
      <EmptyState
        prominent
        icon={<Inbox />}
        title="目前沒有通知"
        description="有新動態時會自動出現在這裡，不需要重新整理。"
        action={
          <Stack
            component="ul"
            sx={{
              m: 0,
              mt: 0.5,
              px: 2,
              py: 1.5,
              gap: '10px',
              width: '100%',
              maxWidth: 320,
              listStyle: 'none',
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.subtle,
            }}
          >
            {EMPTY_REASONS.map(({ kind, text }) => {
              const { Icon, fg } = KIND_LOOKS[kind];

              return (
                <Stack
                  key={kind}
                  component="li"
                  direction="row"
                  sx={{
                    ...typography.body[300],
                    alignItems: 'center',
                    gap: '10px',
                    color: color.fg.neutral.subtle,
                  }}
                >
                  <Icon size={16} aria-hidden color={fg} />
                  {text}
                </Stack>
              );
            })}
          </Stack>
        }
      />
    </Box>
  );
}

interface AdminNotifySheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 通知 (prototype `WGNotifyDrawer`): what waits for the back office, then its team's news, urgent
 * first and then newest (the backend's order). Opening it marks nothing read; only a row's click or
 * 全部標為已讀 does.
 */
export function AdminNotifySheet({ open, onClose }: AdminNotifySheetProps) {
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      width={460}
      variant="admin"
      ariaLabel="通知"
    >
      <AdminNotifyContent onClose={onClose} />
    </SheetFrame>
  );
}

function AdminNotifyContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const list = useInfiniteQuery({
    queryKey: adminNotificationKeys.list,
    queryFn: ({ pageParam }) => listNotificationsAsync({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      last.has_more ? pages.length + 1 : undefined,
    refetchOnMount: 'always',
    // The sheet says so itself, in place of the notices.
    meta: { quietErrors: true },
  });
  const markRead = useMarkNotificationsRead({
    listKey: adminNotificationKeys.list,
    invalidateKeys: [adminNotificationKeys.all, siteNotificationKeys.all],
  });

  const notices = list.data
    ? readAdminNotices(list.data.pages.flatMap((page) => page.items))
    : null;
  const groups = notices ? groupAdminNotices(notices) : [];
  const unread = notices ? notices.filter((notice) => !notice.read) : [];

  // A staff member's newest page can be all site notices: read on without a tap, as the site does,
  // but not while a read is on its way, nor after one failed (載入更多 tries again).
  const readingOn =
    notices !== null &&
    readsNextPageUnasked({
      shown: notices.length,
      pagesRead: list.data?.pages.length ?? 0,
      hasNextPage: list.hasNextPage,
      nextPageFailed: list.isFetchNextPageError,
    });
  const readNext = readingOn && !list.isFetching;
  const { fetchNextPage } = list;

  useEffect(() => {
    if (readNext) {
      void fetchNextPage();
    }
  }, [readNext, fetchNextPage]);

  const searching =
    notices !== null &&
    notices.length === 0 &&
    (readingOn || list.isFetchingNextPage);
  const empty = notices !== null && notices.length === 0 && !list.hasNextPage;

  const openNotice = (notice: AdminNotice) => {
    if (!notice.read) {
      markRead.mutate([notice.uuid]);
    }

    onClose();
    router.push(notice.href);
  };

  return (
    <SheetLayout
      flushBody
      title={
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}
        >
          通知
          {unread.length > 0 ? (
            <Tag tone="info">{unread.length} 則未讀</Tag>
          ) : null}
        </Box>
      }
      subtitle="等你處理的事，以及跟你團隊有關的動態"
      headerContent={
        notices && notices.length > 0 ? (
          <Stack direction="row" sx={{ alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              size="sm"
              startIcon={<CheckCheck size={iconSize.sm} />}
              disabled={unread.length === 0 || markRead.isPending}
              onClick={() =>
                markRead.mutate(unread.map((notice) => notice.uuid))
              }
              sx={{ ml: 'auto', whiteSpace: 'nowrap' }}
            >
              全部標為已讀
            </Button>
          </Stack>
        ) : null
      }
      footer={
        <Typography
          sx={{
            ...typography.body[300],
            flex: 1,
            color: color.fg.neutral.muted,
          }}
        >
          只保留 90 天內的通知
        </Typography>
      }
    >
      {/* `flushBody`: the rows and the sticky headers run edge to edge; the other states pad themselves. */}
      <Box>
        {!notices ? (
          <Box sx={{ p: BODY_PADDING }}>
            <Line>
              {list.isError ? '讀不到通知，請稍後再試一次。' : '載入中…'}
            </Line>
          </Box>
        ) : empty ? (
          <Box sx={{ p: BODY_PADDING }}>
            <AdminNotifyEmpty />
          </Box>
        ) : notices.length === 0 ? (
          <Box sx={{ p: BODY_PADDING }}>
            <Line>
              {searching
                ? '載入中…'
                : list.isFetchNextPageError
                  ? '讀不到通知，請稍後再試一次。'
                  : '最近的通知都是給前台的，這裡不顯示。'}
            </Line>
          </Box>
        ) : (
          groups.map(({ group, notices: inGroup, unread: groupUnread }) => {
            const { title, hint } = ADMIN_NOTICE_GROUPS[group];

            return (
              <Box component="section" key={group} aria-label={title}>
                <Stack
                  direction="row"
                  sx={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    alignItems: 'baseline',
                    gap: '8px',
                    p: '10px 16px 8px',
                    bgcolor: color.bg.neutral.default,
                    borderBottom: `1px solid ${color.border.default}`,
                  }}
                >
                  <Typography
                    sx={{
                      ...typography.label[400],
                      color: GROUP_COLORS[group],
                    }}
                  >
                    {title}
                  </Typography>
                  {groupUnread > 0 ? (
                    <Typography
                      sx={{
                        ...typography.data[300],
                        color: color.fg.neutral.muted,
                      }}
                    >
                      {groupUnread} 則未讀
                    </Typography>
                  ) : null}
                  <Typography
                    sx={{
                      ...typography.body[300],
                      ml: 'auto',
                      color: color.fg.neutral.muted,
                    }}
                  >
                    {hint}
                  </Typography>
                </Stack>
                {inGroup.map((notice) => (
                  <NoticeRow
                    key={notice.uuid}
                    notice={notice}
                    onOpen={openNotice}
                  />
                ))}
              </Box>
            );
          })
        )}

        {list.hasNextPage && !searching ? (
          <Stack sx={{ alignItems: 'center', p: BODY_PADDING }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? '載入中…' : '載入更多'}
            </Button>
          </Stack>
        ) : null}
      </Box>
    </SheetLayout>
  );
}
