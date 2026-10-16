'use client';

import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

interface AuthActionCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

/** The card of 忘記密碼 and 重設密碼, the same surface as the login form's (design `AuthCard`). */
export function AuthActionCard({
  title,
  description,
  children,
}: AuthActionCardProps) {
  return (
    <Stack
      spacing={2}
      sx={{
        width: '100%',
        borderRadius: `${radius.xl}px`,
        border: `1px solid ${color.border.default}`,
        p: 3,
        boxShadow: shadow.sm,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Stack spacing={0.5}>
        <Typography
          component="h2"
          sx={{
            fontSize: displayTextSize[20],
            lineHeight: 1.3,
            fontWeight: 700,
            color: color.fg.neutral.default,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
            color: color.fg.neutral.subtle,
          }}
        >
          {description}
        </Typography>
      </Stack>

      {children}
    </Stack>
  );
}
