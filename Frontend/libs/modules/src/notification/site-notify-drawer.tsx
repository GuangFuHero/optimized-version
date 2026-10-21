'use client';

import AssignmentIndRoundedIcon from '@mui/icons-material/AssignmentIndRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DoNotDisturbOnRoundedIcon from '@mui/icons-material/DoNotDisturbOnRounded';
import HighlightOffRoundedIcon from '@mui/icons-material/HighlightOffRounded';
import NotificationsOffRoundedIcon from '@mui/icons-material/NotificationsOffRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useQuery } from 'urql';

import {
  MyTaskAssignmentsDocument,
  MyTicketsDocument,
} from '@rescue-frontend/data-access';
import { Badge, designTokens, displayTextSize } from '@rescue-frontend/ui';

import { useSiteRouteState } from '../route';
import { SiteActionDrawer } from '../shell/site/site-action-drawer';
import {
  myClaimTicketHref,
  openClaimedTicket,
} from '../ticket/my-claims/my-claims';
import { listNotificationsAsync, markNotificationReadAsync } from './api';
import {
  readSiteNotices,
  ticketOfNeed,
  type NotificationRow,
  type SiteNotice,
  type SiteNoticeKind,
} from './site-notices';
import { refreshUnreadSiteNotices } from './use-unread-site-notices';

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
  'role-approved': { icon: <VerifiedRoundedIcon />, tone: color.fg.success },
  'role-rejected': {
    icon: <HighlightOffRoundedIcon />,
    tone: color.fg.neutral.subtle,
  },
};

/** What `GET /notifications` sent so far, page by page. */
interface LoadedNotices {
  rows: NotificationRow[];
  page: number;
  hasMore: boolean;
}

interface SiteNotifyDrawerProps {
  open: boolean;
  onClose: () => void;
}

function Notice({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Stack
      sx={{ alignItems: 'center', gap: 1.5, py: 4, px: 2, textAlign: 'center' }}
    >
      {icon}
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
}: Pick<SiteNotifyDrawerProps, 'onClose'>) {
  const route = useSiteRouteState();
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
  const [loaded, setLoaded] = useState<LoadedNotices | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Read here since the notices came: shown read at once, without waiting for the backend.
  const [readHere, setReadHere] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let current = true;

    listNotificationsAsync().then(
      ({ items, has_more }) => {
        if (current) {
          setLoaded({ rows: items, page: 1, hasMore: has_more });
        }
      },
      () => {
        if (current) {
          setFailed(true);
        }
      },
    );

    return () => {
      current = false;
    };
  }, []);

  // A list that could not be read leaves its needs' notices unlinked rather than holding up the rest.
  const listsSettled =
    Boolean(requests.data || requests.error) &&
    Boolean(claims.data || claims.error);

  if (!loaded || !listsSettled) {
    return failed ? (
      <Notice>讀不到通知，請稍後再試一次。</Notice>
    ) : (
      <Notice>載入中…</Notice>
    );
  }

  const lists = {
    requests: requests.data?.myTickets ?? [],
    claims: claims.data?.myTaskAssignments ?? [],
  };
  const notices = readSiteNotices(loaded.rows).map((notice) =>
    readHere.has(notice.uuid) ? { ...notice, read: true } : notice,
  );
  const unread = notices.filter((notice) => !notice.read);

  // Read for good in the background; the bell counts again once the backend has it.
  const markRead = (toRead: readonly SiteNotice[]) => {
    if (toRead.length === 0) {
      return;
    }

    setReadHere((previous) => {
      const next = new Set(previous);
      toRead.forEach((notice) => next.add(notice.uuid));
      return next;
    });
    void Promise.allSettled(
      toRead.map((notice) => markNotificationReadAsync(notice.uuid)),
    ).then(refreshUnreadSiteNotices);
  };

  const openNotice = (
    event: MouseEvent<HTMLElement>,
    notice: SiteNotice,
    ticketUuid: string | null,
  ) => {
    markRead(notice.read ? [] : [notice]);

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

  const loadMore = () => {
    setLoadingMore(true);
    listNotificationsAsync({ page: loaded.page + 1 })
      .then(({ items, has_more }) =>
        setLoaded((previous) =>
          previous
            ? {
                rows: [...previous.rows, ...items],
                page: previous.page + 1,
                hasMore: has_more,
              }
            : previous,
        ),
      )
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  return (
    <Stack spacing={1}>
      {unread.length > 0 ? (
        <ButtonBase
          onClick={() => markRead(unread)}
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

      {notices.length === 0 ? (
        <Notice
          icon={
            <NotificationsOffRoundedIcon
              sx={{ fontSize: 28, color: color.fg.neutral.muted }}
            />
          }
        >
          目前沒有通知。有人承接你建立的需求、你承接的任務有異動，或申請有結果時，這裡會出現。
        </Notice>
      ) : (
        notices.map((notice) => {
          const ticketUuid = notice.needUuid
            ? ticketOfNeed(notice.needUuid, lists)
            : null;

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

      {loaded.hasMore ? (
        <ButtonBase
          disabled={loadingMore}
          onClick={loadMore}
          sx={{
            alignSelf: 'center',
            py: 1,
            px: 1.5,
            color: color.brand.secondary.default,
            fontSize: displayTextSize[13],
            fontWeight: 500,
          }}
        >
          {loadingMore ? '載入中…' : '載入更多'}
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
  return (
    <SiteActionDrawer
      open={open}
      title="通知"
      subtitle="有人承接你的需求、你承接的任務有異動、申請審核有結果，都會出現在這裡。"
      onClose={onClose}
    >
      <SiteNotifyContent onClose={onClose} />
    </SiteActionDrawer>
  );
}
