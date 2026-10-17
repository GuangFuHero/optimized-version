'use client';

import { Bell } from 'lucide-react';

import { Box, IconButton, Stack, Typography } from '@mui/material';

import { designTokens, layoutSizes } from '@rescue-frontend/ui';

import { AccountMenu, type AdminUser } from './account-menu';

const { color, typography } = designTokens;

interface AdminHeaderProps {
  title?: string;
  user: AdminUser;
  onSignOut?: () => void;
}

export function AdminHeader({ title, user, onSignOut }: AdminHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        height: layoutSizes.admin.topNavBarHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        px: '28px',
        bgcolor: color.bg.neutral.default,
        borderBottom: `1px solid ${color.border.default}`,
      }}
    >
      <Typography
        component="h1"
        noWrap
        sx={{
          ...typography.heading[700],
          fontSize: 20,
          color: color.fg.neutral.default,
        }}
      >
        {title}
      </Typography>
      <Stack
        direction="row"
        sx={{ ml: 'auto', alignItems: 'center', gap: '16px' }}
      >
        <IconButton aria-label="通知" sx={{ color: color.fg.neutral.subtle }}>
          <Box component={Bell} sx={{ width: 22, height: 22 }} />
        </IconButton>
        <AccountMenu user={user} onSignOut={onSignOut} />
      </Stack>
    </Box>
  );
}
