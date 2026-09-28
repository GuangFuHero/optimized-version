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

export type BadgeVariant = 'solid' | 'subtle' | 'outline' | 'dashed';

export type BadgeSize = 'sm' | 'md' | 'lg';

const SIZES: Record<
  BadgeSize,
  { height: number; px: number; gap: number; icon: number }
> = {
  sm: { height: 20, px: 7, gap: 3, icon: 11 },
  md: { height: 22, px: 8, gap: 4, icon: 12 },
  lg: { height: 24, px: 10, gap: 5, icon: 13 },
};

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
  size?: BadgeSize;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Badge({
  tone = 'neutral',
  variant = 'subtle',
  size = 'md',
  icon,
  children,
  sx,
  ...rest
}: BadgeProps) {
  const t = TONES[tone];
  const s = SIZES[size];
  const fill = {
    solid: { background: t.solidBg, color: t.solidFg, border: 'none' },
    subtle: { background: t.subBg, color: t.subFg, border: 'none' },
    outline: {
      background: 'transparent',
      color: t.subFg,
      border: `1px solid ${color.border.default}`,
    },
    dashed: {
      background: color.bg.neutral.subtle,
      color: color.fg.neutral.muted,
      border: `1px dashed ${color.border.default}`,
    },
  }[variant];

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        gap: `${s.gap}px`,
        height: s.height,
        px: `${s.px}px`,
        borderRadius: `${radius.full}px`,
        ...fill,
        fontFamily: typography.label[300].fontFamily,
        fontSize: typography.label[300].fontSize,
        lineHeight: typography.label[300].lineHeight,
        fontWeight: variant === 'dashed' ? 400 : 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        '& .MuiSvgIcon-root': { fontSize: s.icon, flexShrink: 0 },
        ...sx,
      }}
      {...rest}
    >
      {icon}
      {children}
    </Box>
  );
}
