'use client';

import {
  Avatar as MuiAvatar,
  type AvatarProps as MuiAvatarProps,
} from '@mui/material';

import { designTokens } from '../../theme';

const { color, typography } = designTokens;

export type AvatarTone = 'primary' | 'secondary' | 'neutral';

const TONES: Record<AvatarTone, { bg: string; fg: string }> = {
  primary: { bg: color.bg.primary.subtle, fg: color.brand.primary.subtle },
  secondary: {
    bg: color.bg.secondary.subtle,
    fg: color.brand.secondary.subtle,
  },
  neutral: { bg: color.bg.neutral.sunken, fg: color.fg.neutral.subtle },
};

export interface AvatarProps extends Omit<MuiAvatarProps, 'children'> {
  name?: string;
  size?: number;
  tone?: AvatarTone;
}

export function Avatar({
  name = '',
  size = 40,
  tone = 'primary',
  sx,
  ...rest
}: AvatarProps) {
  const t = TONES[tone];
  const initials = name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <MuiAvatar
      alt={name}
      sx={{
        width: size,
        height: size,
        bgcolor: t.bg,
        color: t.fg,
        fontFamily: typography.label[400].fontFamily,
        fontSize: Math.round(size * 0.36),
        fontWeight: typography.label[400].fontWeight,
        boxShadow: `inset 0 0 0 1px ${color.border.default}`,
        ...sx,
      }}
      {...rest}
    >
      {initials || null}
    </MuiAvatar>
  );
}
