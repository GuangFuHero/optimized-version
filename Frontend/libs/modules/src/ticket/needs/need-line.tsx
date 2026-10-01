'use client';

import { Box, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { NeedActionsMenu } from './need-actions-menu';
import {
  formatNeedQuota,
  isNeedFull,
  resolveNeedClaim,
  type TicketNeed,
} from './need-claim';
import { NeedClaimButton } from './need-claim-button';
import { useNeedClaim } from './need-claim-provider';
import { NeedProgressBar, needTypeIcon } from './need-parts';
import { useNeedActions } from './use-need-actions';

const { color, typography } = designTokens;

interface NeedLineProps {
  need: TicketNeed;
  ticketUuid: string;
  /** The parent ticket's status: a withdrawn or finished ticket closes every need on it. */
  ticketStatus?: string | null;
  /** The ticket's `createdBy`: its requester gets a ⋯ with what they can do to the need. */
  ticketCreatedBy?: string | null;
  isAuthenticated: boolean;
  /** A hairline above it — every line of a card but the first. */
  divider?: boolean;
}

/**
 * One need on a list card: a line rather than the drawer's boxed row, since a card can hold several
 * and a phone screen only fits a handful of lines (prototype `NeedLine`, `site-list.jsx:100-166`).
 */
export function NeedLine({
  need,
  ticketUuid,
  ticketStatus,
  ticketCreatedBy,
  isAuthenticated,
  divider = false,
}: NeedLineProps) {
  const { requestClaim, requestSignIn } = useNeedClaim();
  const actions = useNeedActions(need, { ticketUuid, ticketStatus, ticketCreatedBy });
  const claim = resolveNeedClaim(need, { ticketStatus, isAuthenticated });
  const quota = formatNeedQuota(need, claim.kind);
  const closed = claim.kind === 'canceled' || claim.kind === 'fulfilled';
  const full = !closed && isNeedFull(need);
  const TypeIcon = needTypeIcon(need.taskType);

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        borderTop: divider ? `1px solid ${color.border.default}` : 'none',
        opacity: closed ? 0.55 : 1,
      }}
    >
      <TypeIcon sx={{ fontSize: 16, color: color.fg.neutral.muted, flexShrink: 0 }} />

      {/* At most 460px from the tablet up: across a full-width card the count drifts away from the
          name and the bar stretches into a line nobody can read a ratio off (prototype
          site-list.jsx:118-120). A phone is narrow enough already. */}
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: { tablet: 460 } }}>
        {/* The count drops under the name when both do not fit, rather than squeezing the name:
            on a phone that broke 「清掃志工」 into 「清掃志／工」. Nor is the name ever truncated —
            「分送志工（3 人一組）」cut at the bracket loses what a volunteer decides on (prototype,
            2026-09-11). */}
        <Stack
          direction="row"
          sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}
        >
          <Typography
            sx={{
              flex: '0 1 auto',
              minWidth: 0,
              fontSize: displayTextSize[14],
              lineHeight: 1.35,
              fontWeight: 700,
              color: color.fg.neutral.default,
            }}
          >
            {need.taskName}
          </Typography>
          {/* Whether it still needs people is the one call a volunteer makes here, so the count
              stands at the name's size and carries the state in its colour. */}
          <Typography
            sx={{
              ml: 'auto',
              flexShrink: 0,
              fontFamily: typography.data[400].fontFamily,
              fontSize: displayTextSize[13],
              lineHeight: 1.4,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: full
                ? color.fg.success
                : claim.kind === 'mine'
                  ? color.brand.secondary.subtle
                  : color.fg.neutral.muted,
            }}
          >
            {quota.text}
          </Typography>
        </Stack>
        {quota.fraction === null ? null : (
          <Box sx={{ mt: 0.5 }}>
            <NeedProgressBar fraction={quota.fraction} full={full} height={4} />
          </Box>
        )}
      </Box>

      {/* Kept at the card's right edge, in line with the card's other actions below it — the
          requester's ⋯ last, pulled into the padding so its glyph lines up with them (spec Q51). */}
      <Stack direction="row" sx={{ ml: 'auto', flexShrink: 0, alignItems: 'center', gap: 0.5 }}>
        <NeedClaimButton
          claim={claim}
          needName={need.taskName}
          onClaim={() => requestClaim(ticketUuid, need.uuid)}
          onSignIn={requestSignIn ? () => requestSignIn(ticketUuid, need.uuid) : undefined}
        />
        <NeedActionsMenu needName={need.taskName} items={actions} sx={{ mr: -1 }} />
      </Stack>
    </Stack>
  );
}
