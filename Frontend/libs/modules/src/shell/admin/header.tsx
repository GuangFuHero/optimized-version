'use client';

import { Bell, Menu } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Box, IconButton, Stack, Typography } from '@mui/material';

import { designTokens, layoutSizes } from '@rescue-frontend/ui';

import { AccountMenu } from './account-menu';

const { color, typography } = designTokens;

/** Where a page's title-side controls land; see AdminHeaderSlot. */
const TITLE_SLOT_ID = 'admin-header-title-slot';

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
      {/* `display: contents` so the slot adds no box (and no gap) on pages that leave it empty. */}
      <Box id={TITLE_SLOT_ID} sx={{ display: 'contents' }} />
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

/**
 * Renders a page's own controls right after the header title (e.g. the stations page's count and
 * list/map switch). The shell owns the header, so the page portals into it rather than passing props.
 */
export function AdminHeaderSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(TITLE_SLOT_ID)), []);
  return target ? createPortal(children, target) : null;
}
