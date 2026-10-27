'use client';

import { ButtonBase, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { useContext, type MouseEvent } from 'react';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';
import {
  Badge,
  designTokens,
  Dialog,
  displayTextSize,
} from '@rescue-frontend/ui';

import { useOptionalSiteMapRouteState } from '../../map/site/use-site-map-route-state';
import { SiteMapViewportStoreContext } from '../../map/site/use-site-map-viewport-state';
import { useSiteRouteState } from '../../route';
import { useAuthSession } from '../../session/auth-session';
import { timeAgo } from '../../time';
import { formatTicketAddress } from '../address';
import type { LatLng } from '../address-lookup';
import { myClaimTicketHref } from '../my-claims/my-claims';
import { isTicketRequester } from '../needs/need-actions';
import {
  readTicketNeeds,
  TICKET_NEEDS_QUERY_CONTEXT,
} from '../needs/use-ticket-needs';
import {
  distanceToTicketM,
  openSuspectTicket,
  ticketPoint,
  type SuspectTicket,
} from './duplicate-suspects';

const { color, radius } = designTokens;

/** What sending anyway is called, as the prototype words it for 請求協助, and for 再加一件. */
const ACTS = {
  send: { verb: '送出', busy: '送出中…' },
  add: { verb: '加上去', busy: '加入中…' },
} as const;

function readTicketFields(ticket: GetTicketQuery['ticket']) {
  return ticket ? useFragment(TicketFieldsFragmentDoc, ticket) : null;
}

/**
 * One ticket it looks like, read for what tells the requester whether it is theirs: when it was
 * filed, its title, the needs it matched, which of theirs it is like, and where it is — the
 * prototype's rule is that the reason shows. The backend gives no distance; it is worked out from
 * the ticket's point, which a signed-in person is shown. Pressed, it opens that ticket, handing on
 * where it is.
 */
function SuspectTicketCard({
  suspect,
  from,
  viewerId,
  onOpen,
}: {
  suspect: SuspectTicket;
  from: LatLng | null;
  viewerId: string | null;
  onOpen: (event: MouseEvent<HTMLElement>, point: LatLng | null) => void;
}) {
  const [{ data, fetching }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid: suspect.ticketUuid },
    context: TICKET_NEEDS_QUERY_CONTEXT,
  });
  const ticket = data?.ticket ?? null;
  const fields = readTicketFields(ticket);
  const needNames = readTicketNeeds(ticket)
    .filter((need) => suspect.needUuids.includes(need.uuid))
    .map((need) => need.taskName);
  const meters = distanceToTicketM(from, fields);
  const where = [
    meters === null ? null : `距離約 ${meters} 公尺`,
    formatTicketAddress(ticket?.secondaryLocation),
  ].filter(Boolean);
  const age = timeAgo(fields?.createdAt);
  // Most likely sent before and thought lost: the prototype's 「這是你建的」, put as what happened.
  const mine = isTicketRequester(fields?.createdBy, viewerId);
  const secondary = {
    color: color.fg.neutral.subtle,
    fontSize: displayTextSize[13],
    lineHeight: 1.6,
    textWrap: 'pretty',
  } as const;
  const muted = {
    color: color.fg.neutral.muted,
    fontSize: displayTextSize[12],
    lineHeight: 1.5,
  } as const;

  return (
    <ButtonBase
      LinkComponent={Link}
      href={myClaimTicketHref(suspect.ticketUuid)}
      onClick={(event: MouseEvent<HTMLElement>) =>
        onOpen(event, ticketPoint(fields))
      }
      sx={{
        display: 'block',
        width: '100%',
        p: 1.5,
        textAlign: 'left',
        fontFamily: 'inherit',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      {age || mine ? (
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{ mb: 0.25, alignItems: 'center', flexWrap: 'wrap' }}
        >
          {age ? <Typography sx={muted}>{age}</Typography> : null}
          {mine ? (
            <Badge tone="info" variant="subtle" size="sm">
              你之前送過這張
            </Badge>
          ) : null}
        </Stack>
      ) : null}
      <Typography
        sx={{
          color: color.fg.neutral.default,
          fontSize: displayTextSize[15],
          lineHeight: 1.4,
          fontWeight: 700,
          textWrap: 'pretty',
        }}
      >
        {fields?.title ?? (fetching ? '讀取中…' : '看這張單')}
      </Typography>
      {needNames.length ? (
        <Typography sx={{ ...secondary, mt: 0.25 }}>
          需要：{needNames.join('、')}
        </Typography>
      ) : null}
      {suspect.alike?.length ? (
        <Typography sx={{ ...secondary, mt: 0.25 }}>
          像你填的：{suspect.alike.join('、')}
        </Typography>
      ) : null}
      {where.length ? (
        <Typography sx={{ ...muted, mt: 0.5 }}>{where.join(' · ')}</Typography>
      ) : null}
      {mine ? (
        <Typography sx={{ ...muted, mt: 0.5 }}>
          要多加一件，到那張單按「再加一件需要的幫忙」。
        </Typography>
      ) : null}
    </ButtonBase>
  );
}

interface DuplicateWarnDialogProps {
  open: boolean;
  /** Still set while the dialog fades out, so it keeps its content. */
  tickets: SuspectTicket[];
  /** 請求協助 sends, 再加一件 adds. */
  act: keyof typeof ACTS;
  /** Where what is being sent is, to say how far each ticket is. */
  from: LatLng | null;
  /** Why sending it anyway was refused, already in the requester's words. */
  error: string | null;
  submitting: boolean;
  /** 回去修改: back to what was typed. */
  onBack: () => void;
  /** 不是同一件，送出 / 加上去. */
  onConfirm: () => void;
  /** Leaving for one of the tickets. */
  onLeave: () => void;
}

/**
 * Held as looking like an open need of another ticket (prototype `DuplicateWarnDialog`,
 * `site-actions.jsx:1628-1690`): 請求協助, and 再加一件 on a request. It only asks: 不是同一件 is an
 * ordinary button, and the title asks whether it is the same thing, not whether they are sure — a
 * neighbour may well need the same.
 */
export function DuplicateWarnDialog({
  open,
  tickets,
  act,
  from,
  error,
  submitting,
  onBack,
  onConfirm,
  onLeave,
}: DuplicateWarnDialogProps) {
  const route = useSiteRouteState();
  const mapRoute = useOptionalSiteMapRouteState();
  // Only on the map, whose zoom the ticket is shown at, unless that is too far out.
  const mapViewport = useContext(SiteMapViewportStoreContext);
  const viewerId = useAuthSession().user?.uuid ?? null;
  const { verb, busy } = ACTS[act];

  const openTicket = (
    event: MouseEvent<HTMLElement>,
    ticketUuid: string,
    point: LatLng | null,
  ) => {
    const map = mapRoute
      ? {
          state: mapRoute.state,
          zoom: mapViewport?.getSnapshot().position?.zoom ?? 0,
        }
      : null;
    // Near what is being sent, should the ticket's own point not have been read yet.
    const opening = openSuspectTicket(route, map, ticketUuid, point ?? from);

    if ('onMap' in opening) {
      event.preventDefault();
      mapRoute?.replace(opening.onMap);
    } else if ('select' in opening) {
      // Already on the ticket list: the link would change only `?id=`, which it does not reread.
      event.preventDefault();
      route.replace(opening.select);
    }

    onLeave();
  };

  return (
    <Dialog
      open={open}
      onClose={onBack}
      onConfirm={onConfirm}
      title={`附近已經有 ${tickets.length} 張類似的單`}
      confirmLabel={submitting ? busy : `不是同一件，${verb}`}
      cancelLabel="回去修改"
      error={error}
      submitting={submitting}
    >
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[13],
          lineHeight: 1.6,
          textWrap: 'pretty',
        }}
      >
        {`看一下是不是同一件事。如果不是（例如隔壁鄰居也需要幫忙），照樣${verb}就好。`}
      </Typography>
      {tickets.map((suspect) => (
        <SuspectTicketCard
          key={suspect.ticketUuid}
          suspect={suspect}
          from={from}
          viewerId={viewerId}
          onOpen={(event, point) =>
            openTicket(event, suspect.ticketUuid, point)
          }
        />
      ))}
    </Dialog>
  );
}
