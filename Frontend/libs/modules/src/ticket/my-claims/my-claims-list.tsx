'use client';

import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { useQuery } from 'urql';

import { MyTaskAssignmentsDocument } from '@rescue-frontend/data-access';
import { designTokens, displayTextSize, RowAction } from '@rescue-frontend/ui';

import { useSiteRouteState } from '../../route';
import { BRIEFING_HREF } from '../needs/briefing';
import {
  myClaimTicketHref,
  openClaimedTicket,
  readMyClaims,
  type MyClaim,
} from './my-claims';

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
 * line says what the page says until the briefing has content (Q13).
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
 * here it is a uuid, which tells a volunteer nothing (spec Q50).
 */
function MyClaimRow({
  claim,
  onOpen,
}: {
  claim: MyClaim;
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
      <Stack direction="row" sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <RowAction
          LinkComponent={Link}
          href={myClaimTicketHref(claim.ticketUuid)}
          onClick={onOpen}
          label="查看"
          aria-label={`查看：${claim.ticketTitle}`}
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

/** 我承接的: the needs the viewer claimed, newest first (spec Q16). */
export function MyClaimsList({ onLeave }: MyClaimsListProps) {
  const route = useSiteRouteState();
  const [{ data, fetching, error }] = useQuery({
    query: MyTaskAssignmentsDocument,
    requestPolicy: 'network-only',
    context: MY_CLAIMS_QUERY_CONTEXT,
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
    return fetching || !error ? (
      <Notice>載入中…</Notice>
    ) : (
      <Notice>讀不到你承接的任務，請稍後再試一次。</Notice>
    );
  }

  const claims = readMyClaims(data.myTaskAssignments);

  if (claims.length === 0) {
    return (
      <Notice
        icon={
          <VolunteerActivismRoundedIcon
            sx={{ fontSize: 28, color: color.fg.neutral.muted }}
          />
        }
      >
        你還沒有承接任何任務。在地圖或列表上找一筆需求，按「接這筆」。
      </Notice>
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
        />
      ))}
    </Stack>
  );
}
