'use client';

import {
  Button as MuiButton,
  type ButtonProps as MuiButtonProps,
} from '@mui/material';

import { designTokens } from '../../theme';

const { color, motion, primitives, shadow, typography } = designTokens;

const VARIANTS = {
  primary: {
    bg: color.bg.primary.default,
    hover: color.bg.primary.hover,
    fg: color.fg.onPrimary,
    border: 'transparent',
  },
  secondary: {
    bg: color.bg.secondary.default,
    hover: primitives.color.blue[500],
    fg: color.fg.inverse,
    border: 'transparent',
  },
  danger: {
    bg: color.bg.danger.default,
    hover: color.bg.danger.hover,
    fg: color.fg.onDanger,
    border: 'transparent',
  },
  outline: {
    bg: 'transparent',
    hover: color.bg.primary.subtle,
    fg: color.brand.primary.subtle,
    border: color.border.accent,
  },
  ghost: {
    bg: 'transparent',
    hover: color.bg.neutral.sunken,
    fg: color.fg.neutral.default,
    border: 'transparent',
  },
};

const SIZES = {
  sm: { height: 36, px: '14px', gap: '6px', font: typography.label[400] },
  md: { height: 44, px: '20px', gap: '8px', font: typography.label[500] },
  lg: { height: 52, px: '24px', gap: '8px', font: typography.label[500] },
};

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export interface ButtonProps
  extends Omit<MuiButtonProps, 'variant' | 'size' | 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  sx,
  ...rest
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];

  return (
    <MuiButton
      disableElevation
      disableRipple
      sx={[
        {
          gap: s.gap,
          minWidth: 0,
          minHeight: s.height,
          height: s.height,
          px: s.px,
          ...s.font,
          whiteSpace: 'nowrap',
          border: `1.5px solid ${v.border}`,
          bgcolor: v.bg,
          color: v.fg,
          boxShadow: variant === 'primary' ? shadow.sm : 'none',
          transition: `transform ${motion.transition.spring}, background-color ${motion.transition.fast}, box-shadow ${motion.transition.base}`,
          '& .MuiButton-startIcon, & .MuiButton-endIcon': { m: 0 },
          '&:hover': {
            bgcolor: v.hover,
            transform: 'translateY(-2px)',
            boxShadow: variant === 'primary' ? shadow.md : 'none',
          },
          '&:active': { transform: 'scale(0.97)' },
          '&.Mui-disabled': {
            bgcolor: color.bg.disable,
            color: color.fg.disable,
            boxShadow: 'none',
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
}
