'use client';

import { ButtonBase, type ButtonBaseProps } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export type RowActionTone = 'default' | 'danger';

/**
 * Pill button used in list rows and card footers.
 *
 * Ported from the design system prototype's `rowActionStyle` (`Design/前台/js/site/site-list.jsx`).
 * Three states, not two: `danger` carries a saturated red border (`bg.danger`) rather than a pale
 * tint, and `disabled` overrides tone entirely — a disabled destructive button is grey, not red.
 */
const TONES = {
  default: {
    border: color.border.default,
    color: color.brand.secondary.subtle,
    background: color.bg.neutral.default,
    hover: color.bg.neutral.subtle,
  },
  danger: {
    border: color.bg.danger.default,
    color: color.fg.danger,
    background: color.bg.neutral.default,
    hover: color.bg.danger.subtle,
  },
  disabled: {
    border: color.border.default,
    color: color.fg.disable,
    background: color.bg.disable,
    hover: color.bg.disable,
  },
} as const;

export interface RowActionProps extends Omit<ButtonBaseProps, 'color'> {
  /** Leading glyph. Rendered at the design system's 14px icon size by the caller. */
  icon?: ReactNode;
  label: ReactNode;
  tone?: RowActionTone;
}

export function RowAction({
  icon,
  label,
  tone = 'default',
  disabled = false,
  sx,
  ...rest
}: RowActionProps) {
  const t = disabled ? TONES.disabled : TONES[tone];

  return (
    <ButtonBase
      disableRipple
      disabled={disabled}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        minHeight: 34,
        px: 1.75,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: `${radius.full}px`,
        border: `1px solid ${t.border}`,
        background: t.background,
        color: t.color,
        fontFamily: typography.label[400].fontFamily,
        fontSize: typography.label[400].fontSize,
        lineHeight: typography.label[400].lineHeight,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        transition: `background ${designTokens.motion.transition.fast}, border-color ${designTokens.motion.transition.fast}`,
        '&:hover': { background: t.hover },
        ...sx,
      }}
      {...rest}
    >
      {icon}
      {label}
    </ButtonBase>
  );
}
