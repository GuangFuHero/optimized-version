'use client';

import { Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { resolveNeedClaim } from './need-claim';
import { NeedClaimButton } from './need-claim-button';
import { useClaimNeed, useTicketNeeds } from './use-ticket-needs';

const { color } = designTokens;

interface NeedClaimFooterProps {
  ticketUuid: string;
  isAuthenticated: boolean;
}

/**
 * The drawer footer's main action. With one need a button can only mean that need, so it gets one;
 * with more, one button would have to choose for the volunteer — the problem reported on 2026-09-04
 * — so the footer sends them back up to the rows (prototype `site-detail.jsx:424-436`).
 */
export function NeedClaimFooter({ ticketUuid, isAuthenticated }: NeedClaimFooterProps) {
  const { needs, ticketStatus } = useTicketNeeds(ticketUuid);
  const { claimNeed, claimingNeedUuid } = useClaimNeed(ticketUuid);

  if (needs.length === 0) {
    return null;
  }

  if (needs.length > 1) {
    return (
      <Typography
        sx={{
          // Two shares to the share button's one: at half the row it ran to three lines on a phone.
          flex: 2,
          alignSelf: 'center',
          fontSize: displayTextSize[12],
          lineHeight: 1.5,
          color: color.fg.neutral.subtle,
        }}
      >
        這張單有 {needs.length} 筆需求，請在上面選要接哪一筆。
      </Typography>
    );
  }

  const [need] = needs;

  return (
    <NeedClaimButton
      placement="footer"
      claim={resolveNeedClaim(need, { ticketStatus, isAuthenticated })}
      needName={need.taskName}
      busy={claimingNeedUuid === need.uuid}
      onClaim={() => void claimNeed(need.uuid)}
    />
  );
}
