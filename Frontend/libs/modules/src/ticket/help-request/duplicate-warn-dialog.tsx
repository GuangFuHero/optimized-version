'use client';

import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import { Box, Stack, Typography } from '@mui/material';
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
  Button,
  Callout,
  designTokens,
  displayTextSize,
  Modal,
  RowAction,
} from '@rescue-frontend/ui';

import { useOptionalSiteMapRouteState } from '../../map/site/use-site-map-route-state';
import { SiteMapViewportStoreContext } from '../../map/site/use-site-map-viewport-state';
import { useSiteRouteState } from '../../route';
import { useAuthSession } from '../../session/auth-session';
import { formatTaiwanTime } from '../../time';
import type { LatLng } from '../address-lookup';
import { myClaimTicketHref } from '../my-claims/my-claims';
import { isTicketRequester } from '../needs/need-actions';
import { TICKET_NEEDS_QUERY_CONTEXT } from '../needs/use-ticket-needs';
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
 * One ticket it looks like, read for what tells the requester whether it is theirs: its title,
 * when it was filed, and the reason it was shown — only how far it is and which of theirs it is
 * like (designer, 10-27). The backend gives no distance; it is worked out from the ticket's point,
 * which a signed-in person is shown. 看這張 opens that ticket, handing on where it is.
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
  const fields = readTicketFields(data?.ticket ?? null);
  const meters = distanceToTicketM(from, fields);
  // No ticket number: the site shows none to the public.
  const filedAt = formatTaiwanTime(fields?.createdAt);
  // Most likely sent before and thought lost.
  const mine = isTicketRequester(fields?.createdBy, viewerId);
  const reason = {
    display: 'flex',
    gap: 0.75,
    color: color.fg.neutral.subtle,
    fontSize: displayTextSize[13],
    lineHeight: 1.5,
    textWrap: 'pretty',
  } as const;
  const reasonIcon = {
    flexShrink: 0,
    mt: '2px',
    fontSize: 14,
    color: color.fg.warning,
  } as const;

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          {mine ? (
            <Badge
              tone="info"
              variant="subtle"
              size="sm"
              sx={{ alignSelf: 'flex-start', mb: 0.5 }}
            >
              你曾經開過的單
            </Badge>
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
            {fields?.title ?? (fetching ? '讀取中…' : '這張單')}
          </Typography>
          {filedAt ? (
            <Typography
              sx={{
                mt: 0.25,
                color: color.fg.neutral.muted,
                fontSize: displayTextSize[12],
                lineHeight: 1.4,
              }}
            >
              {filedAt} 建立
            </Typography>
          ) : null}
        </Stack>
        <RowAction
          LinkComponent={Link}
          href={myClaimTicketHref(suspect.ticketUuid)}
          onClick={(event: MouseEvent<HTMLElement>) =>
            onOpen(event, ticketPoint(fields))
          }
          label="看這張"
          aria-label={fields?.title ? `看這張：${fields.title}` : undefined}
          sx={{ flexShrink: 0 }}
        />
      </Stack>
      {meters !== null || suspect.alike?.length ? (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {meters !== null ? (
            <Typography component="div" sx={reason}>
              <PlaceRoundedIcon sx={reasonIcon} />
              相距 {meters} 公尺
            </Typography>
          ) : null}
          {suspect.alike?.length ? (
            <Typography component="div" sx={reason}>
              <ContentCopyRoundedIcon sx={reasonIcon} />
              <span>
                像你填的：
                <Box
                  component="strong"
                  sx={{ color: color.fg.neutral.default }}
                >
                  {suspect.alike.join('、')}
                </Box>
              </span>
            </Typography>
          ) : null}
        </Stack>
      ) : null}
      {mine ? (
        <Typography
          sx={{
            mt: 1,
            px: 1.25,
            py: 1,
            borderRadius: `${radius.sm}px`,
            bgcolor: color.bg.info.subtle,
            color: color.fg.neutral.default,
            fontSize: displayTextSize[13],
            lineHeight: 1.5,
          }}
        >
          要補需求，到那張按「再加一件」。
        </Typography>
      ) : null}
    </Box>
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
  /** The ×: back to what was typed, all of it still there. */
  onBack: () => void;
  /** 確認不重複，送出 / 加上去. */
  onConfirm: () => void;
  /** Leaving for one of the tickets. */
  onLeave: () => void;
}

/**
 * Held as looking like an open need of another ticket (prototype `DuplicateWarnDialog`,
 * `site-actions.jsx:1634-1725` at `0ab95719`): 請求協助, and 再加一件 on a request. It only asks:
 * 確認不重複 is an ordinary button, the only one, and the × goes back to the form — a neighbour may
 * well need the same.
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
    // Mid-send it would close the drawer as not sent, and the send may yet file the ticket.
    if (submitting) {
      event.preventDefault();
      return;
    }

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
    <Modal
      open={open}
      onClose={onBack}
      // The title says no range: the backend holds up to about 260 m away.
      title="疑似重複的單"
      description="不重複開單，避免造成現場混亂。"
      width={480}
      dismissible={!submitting}
      footer={
        <Stack spacing={1} sx={{ width: '100%' }}>
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <Button onClick={onConfirm} disabled={submitting} fullWidth>
            {submitting ? busy : `確認不重複，${verb}`}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1}>
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
      </Stack>
    </Modal>
  );
}
