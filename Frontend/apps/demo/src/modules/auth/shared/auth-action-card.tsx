'use client';

import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface AuthActionCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

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
        borderRadius: '32px',
        border: '1px solid #DCC1B1',
        p: 3,
        boxShadow: '0 1px 1px rgba(0, 0, 0, 0.05)',
        bgcolor: '#FFFFFF',
      }}
    >
      <Stack spacing={0.75} sx={{ px: 0.5 }}>
        <Typography
          component="h2"
          sx={{
            fontSize: 24,
            lineHeight: '32px',
            fontWeight: 700,
            color: '#241B19',
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            lineHeight: '22px',
            color: '#6A5F5B',
          }}
        >
          {description}
        </Typography>
      </Stack>

      {children}
    </Stack>
  );
}
