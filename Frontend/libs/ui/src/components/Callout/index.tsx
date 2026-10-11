import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

import { Box, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

const TONES = {
  info: { bg: color.bg.info.subtle, fg: color.fg.info, Icon: Info },
  success: {
    bg: color.bg.success.subtle,
    fg: color.fg.success,
    Icon: CircleCheck,
  },
  warning: {
    bg: color.bg.warning.subtle,
    fg: color.fg.warning,
    Icon: TriangleAlert,
  },
  danger: {
    bg: color.bg.danger.subtle,
    fg: color.fg.danger,
    Icon: CircleAlert,
  },
};

export type CalloutTone = keyof typeof TONES;

export interface CalloutProps {
  tone?: CalloutTone;
  children: ReactNode;
}

export function Callout({ tone = 'info', children }: CalloutProps) {
  const { bg, fg, Icon } = TONES[tone];

  return (
    <Stack
      direction="row"
      sx={{
        gap: '9px',
        alignItems: 'flex-start',
        p: '11px 13px',
        borderRadius: `${radius.md}px`,
        bgcolor: bg,
        color: fg,
        ...typography.body[300],
      }}
    >
      <Box
        component={Icon}
        sx={{ width: 16, height: 16, mt: '2px', flexShrink: 0 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}
