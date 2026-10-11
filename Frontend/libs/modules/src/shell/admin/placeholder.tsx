'use client';

import { Box } from '@mui/material';

import { Hammer } from 'lucide-react';

import { Stack, Typography } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

import { useActiveAdminNavItem } from './nav';

const { color, typography } = designTokens;

export function AdminPlaceholderPage() {
  const item = useActiveAdminNavItem();

  return (
    <Stack
      sx={{
        height: 420,
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        color: color.fg.neutral.muted,
      }}
    >
      <Box component={Hammer} sx={{ width: 40, height: 40 }} />
      <Typography
        sx={{ ...typography.heading[600], color: color.fg.neutral.subtle }}
      >
        {item?.label} · 建置中
      </Typography>
    </Stack>
  );
}
