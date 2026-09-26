'use client';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { ButtonBase } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { NeedClaim } from './need-claim';

const { color, radius, typography, motion } = designTokens;

/**
 * Fill, border and label per look. `claimed` is not greyed out like the rest that cannot be pressed:
 * 已承接 is good news for the viewer, not a refusal.
 */
const LOOKS = {
  pressable: {
    background: color.bg.primary.default,
    hover: color.bg.primary.hover,
    border: color.bg.primary.default,
    color: color.fg.onPrimary,
  },
  claimed: {
    background: color.bg.secondary.subtle,
    hover: color.bg.secondary.subtle,
    border: color.brand.secondary.default,
    color: color.brand.secondary.subtle,
  },
  disabled: {
    background: color.bg.disable,
    hover: color.bg.disable,
    border: color.border.default,
    color: color.fg.disable,
  },
} as const;

interface NeedClaimButtonProps {
  claim: NeedClaim;
  /** Joins the label in the accessible name — 「接這筆」alone does not say which need. */
  needName: string;
  /** This button's claim is on its way to the server. */
  busy?: boolean;
  /** Runs the `claim` action. Without it the button cannot be pressed. */
  onClaim?: () => void;
  /**
   * `row` sits beside a need; `footer` is the drawer's one main action, shaped like the footer's
   * other buttons (`TicketDetailFooterButton`) so the row of them reads as one set.
   */
  placement?: 'row' | 'footer';
}

export function NeedClaimButton({
  claim,
  needName,
  busy = false,
  onClaim,
  placement = 'row',
}: NeedClaimButtonProps) {
  const label = busy ? '承接中...' : claim.label;
  const pressable = !busy && claim.action === 'claim' && Boolean(onClaim);
  const look = pressable
    ? LOOKS.pressable
    : claim.kind === 'mine'
      ? LOOKS.claimed
      : LOOKS.disabled;
  const Icon =
    claim.kind === 'mine'
      ? CheckRoundedIcon
      : claim.kind === 'guest'
        ? LockRoundedIcon
        : VolunteerActivismRoundedIcon;
  const footer = placement === 'footer';

  return (
    <ButtonBase
      disableRipple
      disabled={!pressable}
      onClick={pressable ? onClaim : undefined}
      // Starts with the visible label, so a voice user saying what they see still hits it.
      aria-label={`${label}：${needName}`}
      sx={{
        flex: footer ? 1 : '0 0 auto',
        minWidth: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: footer ? 1 : 0.75,
        // A row button stays 36px tall: below that it is missed on a moving truck (prototype
        // site-list.jsx:85-92).
        minHeight: footer ? undefined : 36,
        px: footer ? 1 : 1.75,
        py: footer ? '9px' : 0,
        borderRadius: footer ? 0 : `${radius.full}px`,
        border: `1px solid ${look.border}`,
        bgcolor: look.background,
        color: look.color,
        fontFamily: typography.label[400].fontFamily,
        fontSize: footer ? displayTextSize[12] : displayTextSize[13],
        lineHeight: 1.2,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: pressable ? 'pointer' : 'default',
        transition: `background ${motion.transition.fast}`,
        '&:hover': { bgcolor: look.hover },
      }}
    >
      <Icon sx={{ fontSize: footer ? 14 : 15 }} />
      {label}
    </ButtonBase>
  );
}
