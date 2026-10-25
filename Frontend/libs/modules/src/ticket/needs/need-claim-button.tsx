'use client';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { ButtonBase } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { NeedClaim, NeedClaimKind } from './need-claim';

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

/** One per kind, so a kind added without an icon does not compile. */
const ICONS: Record<NeedClaimKind, typeof CheckRoundedIcon> = {
  mine: CheckRoundedIcon,
  guest: LockRoundedIcon,
  open: VolunteerActivismRoundedIcon,
  full: VolunteerActivismRoundedIcon,
  fulfilled: VolunteerActivismRoundedIcon,
};

const SIZES = {
  row: {
    flex: '0 0 auto',
    gap: 0.75,
    // 36px tall: below that it is missed on a moving truck (prototype site-list.jsx:85-92).
    minHeight: 36,
    px: 1.75,
    py: 0,
    borderRadius: `${radius.full}px`,
    fontSize: displayTextSize[13],
    iconSize: 15,
  },
  // The pill and type of the `RowAction` beside it (分享), at the row's 36px.
  footer: {
    flex: 1,
    gap: 0.75,
    minHeight: 36,
    px: 1.75,
    py: 0,
    borderRadius: `${radius.full}px`,
    fontSize: displayTextSize[14],
    iconSize: 14,
  },
} as const;

/**
 * A guest's 「登入後接」 takes the same fill as 「接這筆」 and keeps its lock: the prototype's
 * button, only pressable — it disabled it (site-detail.jsx:103, 128-129).
 */
function lookFor(pressable: boolean, kind: NeedClaimKind) {
  if (pressable) {
    return LOOKS.pressable;
  }

  return kind === 'mine' ? LOOKS.claimed : LOOKS.disabled;
}

interface NeedClaimButtonProps {
  claim: NeedClaim;
  /** Joins the label in the accessible name — 「接這筆」alone does not say which need. */
  needName: string;
  /** Runs the `claim` action. A button whose action has no handler cannot be pressed. */
  onClaim?: () => void;
  /** Runs the `sign-in` action: a guest's 「登入後接」. */
  onSignIn?: () => void;
  /**
   * `row` sits beside a need; `footer` is the drawer's one main action, shaped like the footer's
   * other buttons (`TicketDetailFooterButton`, a `RowAction`) so the row of them reads as one set.
   */
  placement?: 'row' | 'footer';
}

export function NeedClaimButton({
  claim,
  needName,
  onClaim,
  onSignIn,
  placement = 'row',
}: NeedClaimButtonProps) {
  const onPress = claim.action
    ? { claim: onClaim, 'sign-in': onSignIn }[claim.action]
    : undefined;
  const pressable = Boolean(onPress);
  const look = lookFor(pressable, claim.kind);
  const Icon = ICONS[claim.kind];
  const { iconSize, ...size } = SIZES[placement];

  return (
    <ButtonBase
      disableRipple
      disabled={!pressable}
      onClick={onPress}
      // Starts with the visible label, so a voice user saying what they see still hits it.
      aria-label={`${claim.label}：${needName}`}
      sx={{
        ...size,
        minWidth: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${look.border}`,
        bgcolor: look.background,
        color: look.color,
        fontFamily: typography.label[400].fontFamily,
        lineHeight: 1.2,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: pressable ? 'pointer' : 'default',
        transition: `background ${motion.transition.fast}`,
        '&:hover': { bgcolor: look.hover },
      }}
    >
      <Icon sx={{ fontSize: iconSize }} />
      {claim.label}
    </ButtonBase>
  );
}
