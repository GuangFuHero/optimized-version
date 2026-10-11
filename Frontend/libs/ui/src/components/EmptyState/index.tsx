import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
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
          width: 56,
          height: 56,
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.neutral.subtle,
          color: color.fg.neutral.muted,
          '& .MuiSvgIcon-root, & .lucide': {
            width: 26,
            height: 26,
            fontSize: 26,
          },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{ ...typography.label[500], color: color.fg.neutral.subtle }}
      >
        {title}
      </Typography>
      {description ? (
        <Typography
          sx={{
            ...typography.body[300],
            maxWidth: 380,
            color: color.fg.neutral.muted,
          }}
        >
          {description}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}
