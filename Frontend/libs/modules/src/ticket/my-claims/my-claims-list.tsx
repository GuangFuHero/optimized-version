'use client';

import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PersonRemoveRoundedIcon from '@mui/icons-material/PersonRemoveRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from 'urql';

import {
  MyTaskAssignmentsDocument,
  ReleaseClaimDocument,
} from '@rescue-frontend/data-access';
import { designTokens, displayTextSize, RowAction } from '@rescue-frontend/ui';

import { useSiteRouteState } from '../../route';
import { BRIEFING_HREF } from '../needs/briefing';
import { releaseErrorMessage } from '../needs/claim-error';
import { announceTicketChanged } from '../ticket-changes';
import {
  myClaimTicketHref,
  openClaimedTicket,
  readMyClaims,
  type MyClaim,
} from './my-claims';
import { ReleaseClaimDialog } from './release-claim-dialog';

const { color, radius, typography } = designTokens;

// Its own loading line inside the drawer rather than suspending the page behind it. Fetched afresh
// each time the drawer opens — the content mounts with it — so a claim made since shows up.
const MY_CLAIMS_QUERY_CONTEXT = { suspense: false } as const;

interface MyClaimsListProps {
  /** Leaving for another page: the drawer lives in the account menu, which stays across pages. */
  onLeave: () => void;
}

function DetailLine({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        mt: 0.5,
        gap: 0.75,
        alignItems: 'flex-start',
        color: color.fg.neutral.subtle,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          mt: '3px',
          color: color.fg.neutral.muted,
          '& svg': { fontSize: 14 },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
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
 * The next thing to do on this page, not a hint to dismiss (prototype `BriefingDepartureBar`,
 * `site-actions.jsx:1943-1963`). Only above claims: without one there is nowhere to go. Its second
 * line says what the page says until the briefing has content.
 */
function BriefingDepartureBar({ onLeave }: MyClaimsListProps) {
  return (
    <ButtonBase
      LinkComponent={Link}
      href={BRIEFING_HREF}
      onClick={onLeave}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.5,
        minHeight: 56,
        px: 2,
        py: 1.5,
        textAlign: 'left',
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.secondary.subtle,
        border: `1px solid ${color.brand.secondary.default}`,
      }}
    >
      <MenuBookRoundedIcon
        sx={{ fontSize: 20, color: color.brand.secondary.subtle }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            color: color.brand.secondary.subtle,
            fontSize: displayTextSize[14],
            lineHeight: 1.4,
            fontWeight: 700,
          }}
        >
          出發前先看行前資訊
        </Typography>
        <Typography
          sx={{
            mt: 0.25,
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[12],
            lineHeight: 1.5,
          }}
        >
          準備中，出發前請先跟現場聯絡人確認
        </Typography>
      </Box>
      <ChevronRightRoundedIcon
        sx={{ fontSize: 18, color: color.brand.secondary.subtle }}
      />
    </ButtonBase>
  );
}

/**
 * One claimed need, read for keeping the promise: which need, where, and whom to call (prototype
 * `site-actions.jsx:1851-1888`). A ticket with two needs claimed is two rows. No ticket number:
 * here it is a uuid, which tells a volunteer nothing.
 */
function MyClaimRow({
  claim,
  onOpen,
  onRelease,
}: {
  claim: MyClaim;
  /** 查看: a link to the ticket, which may be taken over to select it in place. */
  onOpen: (event: MouseEvent<HTMLElement>) => void;
  /** 釋出名額: asks first. */
  onRelease: () => void;
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
      {claim.claimedAt ? (
        <Typography
          sx={{
            color: color.fg.neutral.muted,
            fontFamily: typography.data[300].fontFamily,
            fontSize: displayTextSize[11],
            lineHeight: 1.4,
          }}
        >
          {claim.claimedAt}
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
        {claim.ticketTitle}
      </Typography>
      <Stack
        direction="row"
        sx={{
          mt: 0.25,
          gap: 0.75,
          alignItems: 'center',
          color: color.brand.secondary.subtle,
        }}
      >
        <VolunteerActivismRoundedIcon sx={{ fontSize: 14 }} />
        <Typography
          sx={{
            fontSize: displayTextSize[13],
            lineHeight: 1.5,
            fontWeight: 700,
          }}
        >
          {claim.needName}
        </Typography>
      </Stack>
      {claim.address ? (
        <DetailLine icon={<PlaceRoundedIcon />}>{claim.address}</DetailLine>
      ) : null}
      {claim.contact ? (
        <DetailLine icon={<PersonRoundedIcon />}>{claim.contact}</DetailLine>
      ) : null}
      <Stack
        direction="row"
        sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <RowAction
          LinkComponent={Link}
          href={myClaimTicketHref(claim.ticketUuid)}
          onClick={onOpen}
          label="查看"
          aria-label={`查看：${claim.ticketTitle}`}
        />
        {/* On the row, not in a menu: someone who cannot go must find where to say so, or nobody
            shows up (prototype site-actions.jsx:1883-1886). Where the requester stopped recruiting
            the list is final, and the line says why there is no button. */}
        {claim.recruitingStopped ? (
          <Stack
            direction="row"
            sx={{
              gap: 0.5,
              alignItems: 'center',
              color: color.fg.neutral.muted,
            }}
          >
            <LockRoundedIcon sx={{ fontSize: 14 }} />
            <Typography sx={{ fontSize: displayTextSize[12], lineHeight: 1.5 }}>
              建單者已停止招募，名單已固定
            </Typography>
          </Stack>
        ) : (
          <RowAction
            icon={<PersonRemoveRoundedIcon sx={{ fontSize: 14 }} />}
            label="釋出名額"
            onClick={onRelease}
            aria-label={`釋出名額：${claim.needName}・${claim.ticketTitle}`}
          />
        )}
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

/** 我承接的: the needs the viewer claimed, newest first. */
export function MyClaimsList({ onLeave }: MyClaimsListProps) {
  const route = useSiteRouteState();
  const [{ data, fetching, error }, reloadClaims] = useQuery({
    query: MyTaskAssignmentsDocument,
    requestPolicy: 'network-only',
    context: MY_CLAIMS_QUERY_CONTEXT,
  });
  const [, executeRelease] = useMutation(ReleaseClaimDocument);
  // Open is kept apart from what is being confirmed, so the dialog keeps its content while it
  // fades out — as the claim confirmation does.
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releasing, setReleasing] = useState<MyClaim | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const claims = data ? readMyClaims(data.myTaskAssignments) : [];
  // After a refusal the list reloads: a place already gone, or on a need stopped meanwhile, has
  // nothing left to confirm.
  const current = releasing
    ? claims.find((claim) => claim.assignmentUuid === releasing.assignmentUuid)
    : undefined;
  const settled = Boolean(releasing) && (!current || current.recruitingStopped);

  const openTicket = (event: MouseEvent<HTMLElement>, ticketUuid: string) => {
    const opening = openClaimedTicket(route, ticketUuid);

    if ('select' in opening) {
      // Already on the ticket list: the link would change only `?id=`, which it does not reread.
      event.preventDefault();
      route.replace(opening.select);
    }

    onLeave();
  };

  const requestRelease = (claim: MyClaim) => {
    setReleaseError(null);
    setReleasing(claim);
    setReleaseOpen(true);
  };

  const confirmRelease = async () => {
    if (!releasing) {
      return;
    }

    setSubmitting(true);
    setReleaseError(null);

    try {
      const result = await executeRelease({ uuid: releasing.assignmentUuid });

      // Answered either way: the place went back, or the need had changed under the volunteer.
      // Both this list and every view of the ticket behind the drawer read it again.
      if (!result.error?.networkError) {
        announceTicketChanged(releasing.ticketUuid);
        reloadClaims({ requestPolicy: 'network-only' });
      }

      if (result.error) {
        setReleaseError(releaseErrorMessage(result.error));
        return;
      }

      setReleaseOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const dialog = (
    <ReleaseClaimDialog
      open={releaseOpen}
      claim={releasing}
      error={releaseError}
      submitting={submitting}
      settled={settled}
      onCancel={() => setReleaseOpen(false)}
      onConfirm={() => void confirmRelease()}
    />
  );

  if (!data) {
    return fetching || !error ? (
      <Notice>載入中…</Notice>
    ) : (
      <Notice>讀不到你承接的任務，請稍後再試一次。</Notice>
    );
  }

  if (claims.length === 0) {
    return (
      <>
        <Notice
          icon={
            <VolunteerActivismRoundedIcon
              sx={{ fontSize: 28, color: color.fg.neutral.muted }}
            />
          }
        >
          你還沒有承接任何任務。在地圖或列表上找一筆需求，按「接這筆」。
        </Notice>
        {dialog}
      </>
    );
  }

  return (
    <Stack spacing={1.5}>
      <BriefingDepartureBar onLeave={onLeave} />
      {claims.map((claim) => (
        <MyClaimRow
          key={claim.assignmentUuid}
          claim={claim}
          onOpen={(event) => openTicket(event, claim.ticketUuid)}
          onRelease={() => requestRelease(claim)}
        />
      ))}
      {dialog}
    </Stack>
  );
}
