'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import { Box, Button, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { useQuery } from 'urql';

import { MyTicketsDocument } from '@rescue-frontend/data-access';
import {
  Badge,
  designTokens,
  displayTextSize,
  RowAction,
} from '@rescue-frontend/ui';

import { useSiteRouteState } from '../../route';
import { myClaimTicketHref, openClaimedTicket } from '../my-claims/my-claims';
import { formatTicketStatusLabel, getTicketStatusTone } from '../status';
import { readMyRequests, type MyRequest } from './my-requests';
import { openHelpRequest } from './open-help-request';

const { color, radius, typography } = designTokens;

// Its own loading line inside the drawer rather than suspending the page behind it. Fetched afresh
// each time the tab shows — the content mounts with it — so a request filed since shows up, and a
// need added, deleted or claimed since is counted.
const MY_TICKETS_QUERY_CONTEXT = { suspense: false } as const;

interface MyRequestsListProps {
  /** Leaving for another page: the drawer lives in the account menu, which stays across pages. */
  onLeave: () => void;
}

/**
 * One filed request, read for how far it got (prototype `site-actions.jsx:1802-1838`): the
 * ticket's status as the list and the map show it, and a line counting its needs. No
 * ticket number: here it is a uuid, which tells a requester nothing, and 我承接的 shows none either.
 */
function MyRequestRow({
  request,
  onOpen,
}: {
  request: MyRequest;
  /** 查看: a link to the ticket, which may be taken over to select it in place. */
  onOpen: (event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Stack
        direction="row"
        sx={{
          gap: 1,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {request.createdAt ? (
            <Typography
              sx={{
                color: color.fg.neutral.muted,
                fontFamily: typography.data[300].fontFamily,
                fontSize: displayTextSize[11],
                lineHeight: 1.4,
              }}
            >
              {request.createdAt}
            </Typography>
          ) : null}
          <Typography
            sx={{
              mt: 0.25,
              color: color.fg.neutral.default,
              fontSize: displayTextSize[15],
              lineHeight: 1.4,
              fontWeight: 700,
              textWrap: 'pretty',
            }}
          >
            {request.title}
          </Typography>
        </Box>
        <Badge tone={getTicketStatusTone(request.status)} variant="solid">
          {formatTicketStatusLabel(request.status)}
        </Badge>
      </Stack>
      {/* What a requester most wants to know is whether people are coming: right under the
          title, before anything to press (prototype site-actions.jsx:1825). */}
      <Typography
        sx={{
          mt: 1.5,
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[13],
          lineHeight: 1.5,
        }}
      >
        {request.progress}
      </Typography>
      <Stack direction="row" sx={{ mt: 1.5, gap: 1 }}>
        <RowAction
          LinkComponent={Link}
          href={myClaimTicketHref(request.ticketUuid)}
          onClick={onOpen}
          label="查看"
          aria-label={`查看：${request.title}`}
        />
      </Stack>
    </Box>
  );
}

function Notice({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Stack
      sx={{ alignItems: 'center', gap: 1.5, py: 4, px: 2, textAlign: 'center' }}
    >
      {icon}
      {children}
    </Stack>
  );
}

function NoticeText({ children }: { children: ReactNode }) {
  return (
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
  );
}

/** 我建立的: the requests the viewer filed, newest first, every status. */
export function MyRequestsList({ onLeave }: MyRequestsListProps) {
  const route = useSiteRouteState();
  const [{ data, fetching, error }] = useQuery({
    query: MyTicketsDocument,
    requestPolicy: 'network-only',
    context: MY_TICKETS_QUERY_CONTEXT,
  });

  const openTicket = (event: MouseEvent<HTMLElement>, ticketUuid: string) => {
    const opening = openClaimedTicket(route, ticketUuid);

    if ('select' in opening) {
      // Already on the ticket list: the link would change only `?id=`, which it does not reread.
      event.preventDefault();
      route.replace(opening.select);
    }

    onLeave();
  };

  if (!data) {
    return (
      <Notice>
        <NoticeText>
          {fetching || !error
            ? '載入中…'
            : '讀不到你建立的求助，請稍後再試一次。'}
        </NoticeText>
      </Notice>
    );
  }

  const requests = readMyRequests(data.myTickets);

  if (requests.length === 0) {
    // Where to start one, rather than where it would be: the prototype's 「右上角」 is not where
    // the button is on a phone.
    return (
      <Notice
        icon={
          <AssignmentRoundedIcon
            sx={{ fontSize: 28, color: color.fg.neutral.muted }}
          />
        }
      >
        <NoticeText>你還沒有送出過求助。</NoticeText>
        <Button
          variant="contained"
          size="small"
          startIcon={<HandshakeRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => {
            onLeave();
            openHelpRequest();
          }}
          sx={{ fontSize: displayTextSize[14] }}
        >
          請求協助
        </Button>
      </Notice>
    );
  }

  return (
    <Stack spacing={1.5}>
      {requests.map((request) => (
        <MyRequestRow
          key={request.ticketUuid}
          request={request}
          onOpen={(event) => openTicket(event, request.ticketUuid)}
        />
      ))}
    </Stack>
  );
}
