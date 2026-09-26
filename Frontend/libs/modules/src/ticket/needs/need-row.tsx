'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import SupportRoundedIcon from '@mui/icons-material/SupportRounded';
import { Box, Stack, Typography } from '@mui/material';

import { Badge, designTokens, displayTextSize } from '@rescue-frontend/ui';

import { formatTicketTypeLabel } from '../status';
import {
  formatNeedQuota,
  isNeedFull,
  resolveNeedClaim,
  type TicketNeed,
} from './need-claim';
import { NeedClaimButton } from './need-claim-button';

const { color, radius, typography } = designTokens;

/** A glyph for each `task_type` that `formatTicketTypeLabel` names; anything else gets a clipboard. */
const NEED_TYPE_ICONS: Record<string, typeof AssignmentRoundedIcon> = {
  rescue: SupportRoundedIcon,
  hr: GroupsRoundedIcon,
  supply: Inventory2RoundedIcon,
  medical: MedicalServicesRoundedIcon,
};

interface NeedRowProps {
  need: TicketNeed;
  /** The parent ticket's status: a withdrawn or finished ticket closes every need on it. */
  ticketStatus?: string | null;
  isAuthenticated: boolean;
  /** This need's claim is on its way to the server. */
  busy?: boolean;
  onClaim?: (need: TicketNeed) => void;
}

/**
 * One need in the ticket drawer: what it is, how many places are left, and its own claim button.
 * A ticket with two needs gets two buttons — never one that picks for the volunteer (prototype
 * `NeedRow`, `Design/前台/js/site/site-detail.jsx:99-136`).
 */
export function NeedRow({
  need,
  ticketStatus,
  isAuthenticated,
  busy = false,
  onClaim,
}: NeedRowProps) {
  const claim = resolveNeedClaim(need, { ticketStatus, isAuthenticated });
  const quota = formatNeedQuota(need, claim.kind);
  const closed = claim.kind === 'canceled' || claim.kind === 'fulfilled';
  const full = !closed && isNeedFull(need);
  const TypeIcon =
    NEED_TYPE_ICONS[need.taskType.trim().toLowerCase()] ?? AssignmentRoundedIcon;

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${
          claim.kind === 'mine' ? color.brand.secondary.default : color.border.default
        }`,
        bgcolor: full ? color.bg.success.subtle : color.bg.neutral.default,
        // Still listed, so a volunteer who claimed it sees it was called off — but set back.
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
      </Stack>

      <Stack direction="row" sx={{ mt: 1, alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {quota.fraction === null ? null : (
            <Box
              sx={{
                height: 6,
                mb: 0.5,
                borderRadius: `${radius.full}px`,
                bgcolor: color.bg.neutral.sunken,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${Math.round(quota.fraction * 100)}%`,
                  height: '100%',
                  borderRadius: `${radius.full}px`,
                  bgcolor: full ? color.bg.success.default : color.bg.primary.default,
                }}
              />
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
          busy={busy}
          onClaim={onClaim ? () => onClaim(need) : undefined}
        />
      </Stack>
    </Box>
  );
}
