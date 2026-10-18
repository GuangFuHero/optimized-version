'use client';

import { ButtonBase, Typography } from '@mui/material';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';
import { designTokens, Dialog, displayTextSize } from '@rescue-frontend/ui';

import { useSiteRouteState } from '../../route';
import { formatTicketAddress } from '../address';
import { myClaimTicketHref, openClaimedTicket } from '../my-claims/my-claims';
import {
  readTicketNeeds,
  TICKET_NEEDS_QUERY_CONTEXT,
} from '../needs/use-ticket-needs';
import type { SuspectTicket } from './add-need';

const { color, radius } = designTokens;

function readTicketTitle(ticket: GetTicketQuery['ticket']): string | null {
  return ticket ? useFragment(TicketFieldsFragmentDoc, ticket).title : null;
}

/**
 * One ticket the need looks like, read for what tells the requester whether it is theirs: its
 * title, the needs it matched, and where it is — the prototype's rule is that the reason shows,
 * and the address is the reason a person can check at a glance. The backend gives no distance.
 * Pressed, it opens that ticket.
 */
function SuspectTicketCard({
  suspect,
  onOpen,
}: {
  suspect: SuspectTicket;
  onOpen: (event: MouseEvent<HTMLElement>) => void;
}) {
  const [{ data, fetching }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid: suspect.ticketUuid },
    context: TICKET_NEEDS_QUERY_CONTEXT,
  });
  const ticket = data?.ticket ?? null;
  const title = readTicketTitle(ticket);
  const needNames = readTicketNeeds(ticket)
    .filter((need) => suspect.needUuids.includes(need.uuid))
    .map((need) => need.taskName);
  const address = formatTicketAddress(ticket?.secondaryLocation);

  return (
    <ButtonBase
      LinkComponent={Link}
      href={myClaimTicketHref(suspect.ticketUuid)}
      onClick={onOpen}
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
      <Typography
        sx={{
          color: color.fg.neutral.default,
          fontSize: displayTextSize[15],
          lineHeight: 1.4,
          fontWeight: 700,
          textWrap: 'pretty',
        }}
      >
        {title ?? (fetching ? '讀取中…' : '看這張單')}
      </Typography>
      {needNames.length ? (
        <Typography
          sx={{
            mt: 0.25,
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
            textWrap: 'pretty',
          }}
        >
          需要：{needNames.join('、')}
        </Typography>
      ) : null}
      {address ? (
        <Typography
          sx={{
            mt: 0.5,
            color: color.fg.neutral.muted,
            fontSize: displayTextSize[12],
            lineHeight: 1.5,
          }}
        >
          {address}
        </Typography>
      ) : null}
    </ButtonBase>
  );
}

interface AddNeedDuplicateDialogProps {
  open: boolean;
  /** Still set while the dialog fades out, so it keeps its content. */
  tickets: SuspectTicket[];
  /** Why adding it anyway was refused, already in the requester's words. */
  error: string | null;
  submitting: boolean;
  /** 回去修改: back to the need as typed. */
  onBack: () => void;
  /** 不是同一件，加上去. */
  onAddAnyway: () => void;
  /** Leaving for one of the tickets: what was typed goes, as in the prototype. */
  onLeave: () => void;
}

/**
 * 再加一件 held as looking like an open need of another ticket (prototype `DuplicateWarnDialog`,
 * `site-actions.jsx`). It only asks: 不是同一件，加上去 is an ordinary button, and the title asks
 * whether it is the same thing, not whether they are sure — a neighbour may well need the same.
 */
export function AddNeedDuplicateDialog({
  open,
  tickets,
  error,
  submitting,
  onBack,
  onAddAnyway,
  onLeave,
}: AddNeedDuplicateDialogProps) {
  const route = useSiteRouteState();

  const openTicket = (event: MouseEvent<HTMLElement>, ticketUuid: string) => {
    const opening = openClaimedTicket(route, ticketUuid);

    if ('select' in opening) {
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
      onConfirm={onAddAnyway}
      title={`附近已經有 ${tickets.length} 張類似的單`}
      confirmLabel={submitting ? '加入中…' : '不是同一件，加上去'}
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
        看一下是不是同一件事。如果不是（例如隔壁鄰居也需要幫忙），照樣加上去就好。
      </Typography>
      {tickets.map((suspect) => (
        <SuspectTicketCard
          key={suspect.ticketUuid}
          suspect={suspect}
          onOpen={(event) => openTicket(event, suspect.ticketUuid)}
        />
      ))}
    </Dialog>
  );
}
