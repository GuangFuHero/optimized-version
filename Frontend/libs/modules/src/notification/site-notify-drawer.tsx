'use client';

import AssignmentIndRoundedIcon from '@mui/icons-material/AssignmentIndRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DoNotDisturbOnRoundedIcon from '@mui/icons-material/DoNotDisturbOnRounded';
import HighlightOffRoundedIcon from '@mui/icons-material/HighlightOffRounded';
import MergeRoundedIcon from '@mui/icons-material/MergeRounded';
import NotificationsOffRoundedIcon from '@mui/icons-material/NotificationsOffRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useQuery } from 'urql';

import {
  MyTaskAssignmentsDocument,
  MyTicketsDocument,
} from '@rescue-frontend/data-access';
import {
  Badge,
  designTokens,
  displayTextSize,
  EmptyState,
} from '@rescue-frontend/ui';

import { useSiteRouteState } from '../route';
import { SiteActionDrawer } from '../shell/site/site-action-drawer';
import {
  myClaimTicketHref,
  openClaimedTicket,
} from '../ticket/my-claims/my-claims';
import {
  listNotificationsAsync,
  markNotificationReadAsync,
  siteNotificationKeys,
  type NotificationPage,
} from './api';
import {
  notMarkedRead,
  readSiteNotices,
  readsNextPageUnasked,
  ticketOfNeed,
  withReadState,
  type SiteNotice,
  type SiteNoticeKind,
} from './site-notices';

const { color, radius, typography } = designTokens;

// The lists' own loading line inside the drawer rather than suspending the page behind it.
const NEED_LISTS_QUERY_CONTEXT = { suspense: false } as const;

/**
 * Each kind's icon and colour (prototype `KIND_META`). An application turned down is grey, not red:
 * nothing the person had is gone, and red would read as something gone wrong.
 */
const KIND_LOOKS: Record<SiteNoticeKind, { icon: ReactNode; tone: string }> = {
  claimed: {
    icon: <VolunteerActivismRoundedIcon />,
    tone: color.brand.secondary.subtle,
  },
  assigned: {
    icon: <AssignmentIndRoundedIcon />,
    tone: color.brand.secondary.subtle,
  },
  'need-full': { icon: <CheckCircleRoundedIcon />, tone: color.fg.success },
  'called-off': { icon: <DoNotDisturbOnRoundedIcon />, tone: color.fg.danger },
  // Not in the prototype, which has no notice for a duplicate review.
  merged: { icon: <MergeRoundedIcon />, tone: color.brand.secondary.subtle },
  // Not in the prototype either. A warning, not red: the ticket stands, only something in it may be
  // wrong.
  'audit-issue': { icon: <ReportProblemRoundedIcon />, tone: color.fg.warning },
  'role-approved': { icon: <VerifiedRoundedIcon />, tone: color.fg.success },
  'role-rejected': {
    icon: <HighlightOffRoundedIcon />,
    tone: color.fg.neutral.subtle,
  },
};

/** The drawer's cached pages with those in `uuids` read, or unread again. */
function setCachedReadState(
  queryClient: QueryClient,
  uuids: readonly string[],
  read: boolean,
) {
  if (uuids.length === 0) {
    return;
  }

  queryClient.setQueryData<InfiniteData<NotificationPage>>(
    siteNotificationKeys.list,
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: withReadState(page.items, uuids, read),
        })),
      },
  );
}

interface SiteNotifyDrawerProps {
  open: boolean;
  onClose: () => void;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <Stack
      sx={{ alignItems: 'center', gap: 1.5, py: 4, px: 2, textAlign: 'center' }}
    >
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[13],
          lineHeight: 1.6,
          textWrap: 'pretty',
        }}
      >
        {children}
      </Typography>
    </Stack>
  );
}

// What brings a notice, one short line each: in a phone's drawer a paragraph would not show three.
const EMPTY_REASONS = [
  { icon: VolunteerActivismRoundedIcon, text: '有人承接了你建立的求助' },
  { icon: DoNotDisturbOnRoundedIcon, text: '你承接的任務有異動' },
  { icon: VerifiedRoundedIcon, text: '你的申請有審核結果' },
];

/**
 * No notice yet (prototype `SiteNotifyEmpty`): what the drawer is for and what will bring something,
 * so an empty drawer does not read as a broken one. No button: notices come from what others do.
 * It stands in for the drawer's subtitle, which would say the same again.
 */
function SiteNotifyEmpty() {
  return (
    <Box role="status">
      <EmptyState
        prominent
        icon={<NotificationsOffRoundedIcon />}
        title="目前沒有通知"
        description="有新動態時會出現在這裡。"
        action={
          <Stack
            component="ul"
            sx={{
              m: 0,
              mt: 0.5,
              px: 2,
              py: 1.5,
              gap: 1,
              width: '100%',
              maxWidth: 300,
              listStyle: 'none',
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.subtle,
            }}
          >
            {EMPTY_REASONS.map(({ icon: Icon, text }) => (
              <Stack
                key={text}
                component="li"
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: 1,
                  color: color.fg.neutral.subtle,
                  fontSize: displayTextSize[13],
                  lineHeight: 1.5,
                }}
              >
                <Icon
                  aria-hidden
                  sx={{
                    fontSize: 16,
                    flexShrink: 0,
                    color: color.fg.neutral.muted,
                  }}
                />
                {text}
              </Stack>
            ))}
          </Stack>
        }
      />
    </Box>
  );
}

/**
 * One notice (prototype `site-notify.jsx:204-226`): bold and shaded until read. A notice whose need
 * is still on the viewer's lists links to its ticket; the rest only mark it read, and once read do
 * nothing. No ticket number, which is a uuid here.
 */
function SiteNoticeRow({
  notice,
  href,
  onClick,
}: {
  notice: SiteNotice;
  href: string | null;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}) {
  const look = KIND_LOOKS[notice.kind];
  const sx = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 1.5,
    width: '100%',
    p: 1.5,
    textAlign: 'left',
    borderRadius: `${radius.md}px`,
    border: `1px solid ${color.border.default}`,
    bgcolor: notice.read ? 'transparent' : color.bg.neutral.subtle,
  } as const;
  const content = (
    <>
      <Box
        sx={{
          display: 'grid',
          mt: '2px',
          flexShrink: 0,
          color: look.tone,
          '& svg': { fontSize: 18 },
        }}
      >
        {look.icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            color: color.fg.neutral.default,
            fontSize: displayTextSize[14],
            lineHeight: 1.5,
            fontWeight: notice.read ? 500 : 700,
            textWrap: 'pretty',
          }}
        >
          {notice.title}
        </Typography>
        <Typography
          sx={{
            mt: 0.25,
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
            textWrap: 'pretty',
          }}
        >
          {notice.body}
        </Typography>
        {notice.at ? (
          <Typography
            sx={{
              mt: 0.5,
              color: color.fg.neutral.muted,
              fontFamily: typography.data[300].fontFamily,
              fontSize: displayTextSize[11],
              lineHeight: 1.4,
            }}
          >
            {notice.at}
          </Typography>
        ) : null}
      </Box>
      {notice.read ? null : (
        <Badge tone="warning" variant="subtle" sx={{ flexShrink: 0 }}>
          新
        </Badge>
      )}
    </>
  );

  return href ? (
    <ButtonBase LinkComponent={Link} href={href} onClick={onClick} sx={sx}>
      {content}
    </ButtonBase>
  ) : (
    <ButtonBase disabled={notice.read} onClick={onClick} sx={sx}>
      {content}
    </ButtonBase>
  );
}

/**
 * What the drawer holds. Mounted at each opening — the drawer's content unmounts once closed — so
 * the notices are read afresh, and with them 我的任務's two lists, which say which ticket each
 * notice's need is on.
 */
function SiteNotifyContent({
  onClose,
  onEmpty,
}: Pick<SiteNotifyDrawerProps, 'onClose'> & {
  onEmpty: (empty: boolean) => void;
}) {
  const route = useSiteRouteState();
  const queryClient = useQueryClient();
  const [requests] = useQuery({
    query: MyTicketsDocument,
    requestPolicy: 'network-only',
    context: NEED_LISTS_QUERY_CONTEXT,
  });
  const [claims] = useQuery({
    query: MyTaskAssignmentsDocument,
    requestPolicy: 'network-only',
    context: NEED_LISTS_QUERY_CONTEXT,
  });
  const list = useInfiniteQuery({
    queryKey: siteNotificationKeys.list,
    queryFn: ({ pageParam }) => listNotificationsAsync({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      last.has_more ? pages.length + 1 : undefined,
    refetchOnMount: 'always',
    // The drawer says so itself, in place of the notices.
    meta: { quietErrors: true },
  });
  // Shown read at once, and read for good in the background. A PATCH that fails (offline, a 5xx)
  // puts its notice back to unread, and 全部標為已讀 with it, to try again; then both the list and
  // the bell's count are read again from the backend.
  const markRead = useMutation({
    mutationFn: (uuids: string[]) =>
      Promise.allSettled(uuids.map(markNotificationReadAsync)),
    onMutate: async (uuids) => {
      // A read of the list still on its way would put the notices back as they were.
      await queryClient.cancelQueries({ queryKey: siteNotificationKeys.list });
      setCachedReadState(queryClient, uuids, true);
    },
    onSuccess: (results, uuids) =>
      setCachedReadState(queryClient, notMarkedRead(uuids, results), false),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: siteNotificationKeys.all }),
  });

  // A list that could not be read leaves its needs' notices unlinked rather than holding up the rest.
  const listsSettled =
    Boolean(requests.data || requests.error) &&
    Boolean(claims.data || claims.error);
  const notices = list.data
    ? readSiteNotices(list.data.pages.flatMap((page) => page.items))
    : null;
  // Told once the notices are in, and not taken back while they load again at the next opening:
  // the subtitle would come and go each time. A page that shows nothing is not empty while another
  // follows it, as the site shows only some kinds of notice; a read that fails puts the subtitle back
  // beside its message.
  const empty =
    notices && listsSettled
      ? notices.length === 0 && !list.hasNextPage
      : list.isError
        ? false
        : null;

  useEffect(() => {
    if (empty !== null) {
      onEmpty(empty);
    }
  }, [empty, onEmpty]);

  // Pages that show nothing, with more after them, would leave only 載入更多 under the subtitle: the
  // next is read without a tap, a round at a time. Not while a read is on its way (each opening reads
  // the pages it has again first), nor after one failed, which 載入更多 tries again.
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

  if (!notices || !listsSettled) {
    return list.isError ? (
      <Notice>讀不到通知，請稍後再試一次。</Notice>
    ) : (
      <Notice>載入中…</Notice>
    );
  }

  const lists = {
    requests: requests.data?.myTickets ?? [],
    claims: claims.data?.myTaskAssignments ?? [],
  };
  const unread = notices.filter((notice) => !notice.read);
  // Nothing shown yet and the next page on its way, by itself or from a tap: one loading line, no button.
  const searching =
    notices.length === 0 && (readingOn || list.isFetchingNextPage);

  const openNotice = (
    event: MouseEvent<HTMLElement>,
    notice: SiteNotice,
    ticketUuid: string | null,
  ) => {
    if (!notice.read) {
      markRead.mutate([notice.uuid]);
    }

    if (!ticketUuid) {
      return;
    }

    const opening = openClaimedTicket(route, ticketUuid);

    if ('select' in opening) {
      // Already on the ticket list: the link would change only `?id=`, which it does not reread.
      event.preventDefault();
      route.replace(opening.select);
    }

    onClose();
  };

  return (
    <Stack spacing={1}>
      {unread.length > 0 ? (
        <ButtonBase
          onClick={() => markRead.mutate(unread.map((notice) => notice.uuid))}
          sx={{
            alignSelf: 'flex-end',
            px: 0.5,
            color: color.brand.secondary.default,
            fontSize: displayTextSize[12],
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          全部標為已讀
        </ButtonBase>
      ) : null}

      {empty ? (
        <SiteNotifyEmpty />
      ) : notices.length === 0 ? (
        // Not empty, so more follow: a round read without finding any, or a read that failed.
        <Notice>
          {searching
            ? '載入中…'
            : list.isFetchNextPageError
              ? '讀不到通知，請稍後再試一次。'
              : '最近的通知都是管理平台的，這裡不顯示。'}
        </Notice>
      ) : (
        notices.map((notice) => {
          const ticketUuid =
            notice.ticketUuid ??
            (notice.needUuid ? ticketOfNeed(notice.needUuid, lists) : null);

          return (
            <SiteNoticeRow
              key={notice.uuid}
              notice={notice}
              href={ticketUuid ? myClaimTicketHref(ticketUuid) : null}
              onClick={(event) => openNotice(event, notice, ticketUuid)}
            />
          );
        })
      )}

      {list.hasNextPage && !searching ? (
        <ButtonBase
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
          sx={{
            alignSelf: 'center',
            py: 1,
            px: 1.5,
            color: color.brand.secondary.default,
            fontSize: displayTextSize[13],
            fontWeight: 500,
          }}
        >
          {list.isFetchingNextPage ? '載入中…' : '載入更多'}
        </ButtonBase>
      ) : null}
    </Stack>
  );
}

/**
 * 通知 (prototype `SiteNotifyDrawer`, `site-notify.jsx:150-230`): what is about the viewer, newest
 * first. The site's action drawer, as 我的任務 is: a sheet from the bottom on a phone.
 */
export function SiteNotifyDrawer({ open, onClose }: SiteNotifyDrawerProps) {
  // While the empty state is shown, it says what the subtitle would, so the subtitle goes.
  const [empty, setEmpty] = useState(false);

  return (
    <SiteActionDrawer
      open={open}
      title="通知"
      subtitle={
        empty
          ? undefined
          : '有人承接你的需求、你承接的任務有異動、申請審核有結果，都會出現在這裡。'
      }
      onClose={onClose}
    >
      <SiteNotifyContent onClose={onClose} onEmpty={setEmpty} />
    </SiteActionDrawer>
  );
}
