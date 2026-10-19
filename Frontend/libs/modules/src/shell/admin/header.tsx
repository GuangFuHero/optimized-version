'use client';

import { Bell, Menu } from 'lucide-react';

import { Box, IconButton, Stack, Typography } from '@mui/material';

import { designTokens, layoutSizes } from '@rescue-frontend/ui';

import { AccountMenu } from './account-menu';

const { color, typography } = designTokens;

interface AdminHeaderProps {
  title?: string;
  onOpenNavigation?: () => void;
  navigationOpen?: boolean;
}

export function AdminHeader({
  title,
  onOpenNavigation,
  navigationOpen,
}: AdminHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        height: layoutSizes.admin.topNavBarHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: { mobile: '4px', tablet: '16px' },
        px: { mobile: '8px', tablet: '28px' },
        bgcolor: color.bg.neutral.default,
        borderBottom: `1px solid ${color.border.default}`,
      }}
    >
      <IconButton
        aria-label="開啟導覽選單"
        aria-expanded={navigationOpen}
        aria-controls="admin-mobile-navigation"
        onClick={onOpenNavigation}
        sx={{
          display: { mobile: 'inline-flex', tablet: 'none' },
          width: 44,
          height: 44,
          flexShrink: 0,
        }}
      >
        <Menu />
      </IconButton>
      <Typography
        component="h1"
        noWrap
        sx={{
          ...typography.heading[700],
          fontSize: { mobile: 17, tablet: 20 },
          minWidth: 0,
          color: color.fg.neutral.default,
        }}
      >
        {title}
      </Typography>
      <Stack
        direction="row"
        sx={{
          ml: 'auto',
          alignItems: 'center',
          gap: { mobile: '2px', tablet: '16px' },
          flexShrink: 0,
        }}
      >
        <IconButton
          aria-label="通知"
          sx={{ color: color.fg.neutral.subtle, width: 44, height: 44 }}
        >
          <Box component={Bell} sx={{ width: 22, height: 22 }} />
        </IconButton>
        <AccountMenu />
      </Stack>
    </Box>
  );
}
