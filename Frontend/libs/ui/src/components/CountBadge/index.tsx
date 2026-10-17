import { Box, type BoxProps } from '@mui/material';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export type CountBadgeTone = 'neutral' | 'primary' | 'warning' | 'danger';

const TONES: Record<CountBadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: color.bg.neutral.sunken, fg: color.fg.neutral.subtle },
  primary: { bg: color.bg.primary.default, fg: color.fg.onPrimary },
  warning: { bg: color.bg.warning.default, fg: color.fg.onWarning },
  danger: { bg: color.bg.danger.default, fg: color.fg.onDanger },
};

export interface CountBadgeProps extends Omit<BoxProps, 'color' | 'children'> {
  count: number;
  max?: number;
  tone?: CountBadgeTone;
}

export function CountBadge({
  count,
  max = 99,
  tone = 'neutral',
  sx,
  ...rest
}: CountBadgeProps) {
  const t = TONES[tone];

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        minWidth: 18,
        height: 18,
        px: '5px',
        borderRadius: `${radius.full}px`,
        bgcolor: t.bg,
        color: t.fg,
        ...typography.data[300],
        fontWeight: 700,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        ...sx,
      }}
      {...rest}
    >
      {count > max ? `${max}+` : count}
    </Box>
  );
}
