'use client';

import { Box, type BoxProps } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type BadgeVariant = 'solid' | 'subtle';

/**
 * Fill + label for every tone, in both variants.
 *
 * Ported from the design system's `Badge` (`_ds_bundle.js`, `components/core/Badge.jsx`). Values
 * track `design-tokens.ts`, which since 2026-09-17 is ahead of the Figma export on `on-secondary`
 * and `on-info`. The point of keeping the pairs together is that the label colour is never assumed —
 * `warning` solid is a light amber that takes near-black text, while `danger` solid takes white.
 * Picking a fill without its label is how the old per-component badges ended up with white-on-amber.
 *
 * `neutral` deliberately has the same fill in both variants: the design system defines no solid
 * neutral, so a solid request falls back to the sunken surface rather than inventing a grey.
 */
const TONES: Record<
  BadgeTone,
  { solidBg: string; solidFg: string; subBg: string; subFg: string }
> = {
  neutral: {
    solidBg: color.bg.neutral.sunken,
    solidFg: color.fg.neutral.subtle,
    subBg: color.bg.neutral.sunken,
    subFg: color.fg.neutral.subtle,
  },
  primary: {
    solidBg: color.bg.primary.default,
    solidFg: color.fg.onPrimary,
    subBg: color.bg.primary.subtle,
    subFg: color.brand.primary.subtle,
  },
  secondary: {
    solidBg: color.bg.secondary.default,
    solidFg: color.fg.onSecondary,
    subBg: color.bg.secondary.subtle,
    subFg: color.brand.secondary.subtle,
  },
  success: {
    solidBg: color.bg.success.default,
    solidFg: color.fg.onSuccess,
    subBg: color.bg.success.subtle,
    subFg: color.fg.success,
  },
  warning: {
    solidBg: color.bg.warning.default,
    solidFg: color.fg.onWarning,
    subBg: color.bg.warning.subtle,
    subFg: color.fg.warning,
  },
  danger: {
    solidBg: color.bg.danger.default,
    solidFg: color.fg.onDanger,
    subBg: color.bg.danger.subtle,
    subFg: color.fg.danger,
  },
  info: {
    solidBg: color.bg.info.default,
    solidFg: color.fg.onInfo,
    subBg: color.bg.info.subtle,
    subFg: color.fg.info,
  },
};

export interface BadgeProps extends Omit<BoxProps, 'color'> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  children?: ReactNode;
}

/**
 * Compact status / metadata label.
 *
 * Both `secondary` and `info` solid label BLACK, not white, since the designer's 2026-09-17 ruling:
 * white on `#2592B9` measured 3.56:1, black measures 5.30:1.
 *
 * Every tone/variant pair clears WCAG AA, and `design-tokens.spec.ts` asserts it — including
 * `warning` + `subtle`, which measured 3.46:1 until the `amber-900` primitive was added.
 */
export function Badge({
  tone = 'neutral',
  variant = 'subtle',
  children,
  sx,
  ...rest
}: BadgeProps) {
  const t = TONES[tone];
  const solid = variant === 'solid';

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 22,
        px: 1,
        borderRadius: `${radius.full}px`,
        background: solid ? t.solidBg : t.subBg,
        color: solid ? t.solidFg : t.subFg,
        fontFamily: typography.label[300].fontFamily,
        fontSize: typography.label[300].fontSize,
        lineHeight: typography.label[300].lineHeight,
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
