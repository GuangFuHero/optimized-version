'use client';

import { Box, Stack, Typography } from '@mui/material';

import { Badge, designTokens, displayTextSize } from '@rescue-frontend/ui';

import { formatTicketTypeLabel } from '../status';
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

const { color, radius, typography } = designTokens;

interface NeedRowProps {
  need: TicketNeed;
  ticketUuid: string;
  /** The parent ticket's status: a withdrawn or finished ticket closes every need on it. */
  ticketStatus?: string | null;
  /** The ticket's `createdBy`: its requester gets a ⋯ with what they can do to the need. */
  ticketCreatedBy?: string | null;
  isAuthenticated: boolean;
}

/**
 * One need in the ticket drawer: what it is, how many places are left, and its own claim button.
 * A ticket with two needs gets two buttons — never one that picks for the volunteer (prototype
 * `NeedRow`, `Design/前台/js/site/site-detail.jsx:99-136`).
 */
export function NeedRow({
  need,
  ticketUuid,
  ticketStatus,
  ticketCreatedBy,
  isAuthenticated,
}: NeedRowProps) {
  const { requestClaim, requestSignIn } = useNeedClaim();
  const actions = useNeedActions(need, { ticketUuid, ticketStatus, ticketCreatedBy });
  const claim = resolveNeedClaim(need, { ticketStatus, isAuthenticated });
  const quota = formatNeedQuota(need, claim.kind);
  const closed = claim.kind === 'fulfilled';
  const full = !closed && isNeedFull(need);
  const TypeIcon = needTypeIcon(need.taskType);

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${
          claim.kind === 'mine' ? color.brand.secondary.default : color.border.default
        }`,
        bgcolor: full ? color.bg.success.subtle : color.bg.neutral.default,
        // Still listed, but set back: it has its people, and there is no place left to take (Q42).
        opacity: closed ? 0.6 : 1,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <TypeIcon sx={{ fontSize: 16, color: color.fg.neutral.muted, flexShrink: 0 }} />
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: displayTextSize[14],
            lineHeight: 1.4,
            fontWeight: 700,
            color: color.fg.neutral.default,
          }}
        >
          {need.taskName}
        </Typography>
        <Badge tone="neutral" variant="subtle">
          {formatTicketTypeLabel(need.taskType)}
        </Badge>
        {/* Top right, where a card keeps its menu, apart from the claim button below (spec Q51).
            Pulled into the row's padding, so its 36px target does not make the line taller. */}
        <NeedActionsMenu needName={need.taskName} items={actions} sx={{ my: -1, mr: -1 }} />
      </Stack>

      <Stack direction="row" sx={{ mt: 1, alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {quota.fraction === null ? null : (
            <Box sx={{ mb: 0.5 }}>
              <NeedProgressBar fraction={quota.fraction} full={full} height={6} />
            </Box>
          )}
          <Typography
            sx={{
              fontFamily: typography.data[300].fontFamily,
              fontSize: displayTextSize[12],
              lineHeight: 1.5,
              color: color.fg.neutral.subtle,
            }}
          >
            {quota.text}
          </Typography>
        </Box>
        <NeedClaimButton
          claim={claim}
          needName={need.taskName}
          onClaim={() => requestClaim(ticketUuid, need.uuid)}
          onSignIn={requestSignIn ? () => requestSignIn(ticketUuid, need.uuid) : undefined}
        />
      </Stack>
    </Box>
  );
}
