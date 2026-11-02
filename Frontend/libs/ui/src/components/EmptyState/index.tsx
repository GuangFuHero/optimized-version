import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * For an empty state that is all a panel holds, as the notification drawer's: a larger circle,
   * and the title and description a step darker.
   */
  prominent?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  prominent = false,
}: EmptyStateProps) {
  const circle = prominent ? 64 : 56;
  const glyph = prominent ? 28 : 26;

  return (
    <Stack
      sx={{
        alignItems: 'center',
        gap: '12px',
        p: '56px 24px',
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: circle,
          height: circle,
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.neutral.subtle,
          color: color.fg.neutral.muted,
          '& .MuiSvgIcon-root, & .lucide': {
            width: glyph,
            height: glyph,
            fontSize: glyph,
          },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          ...typography.label[500],
          color: prominent ? color.fg.neutral.default : color.fg.neutral.subtle,
        }}
      >
        {title}
      </Typography>
      {description ? (
        <Typography
          sx={{
            ...typography.body[300],
            maxWidth: 380,
            color: prominent ? color.fg.neutral.subtle : color.fg.neutral.muted,
          }}
        >
          {description}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}
