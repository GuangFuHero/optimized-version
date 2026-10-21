'use client';

import { Bell } from 'lucide-react';
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
}

export function AdminHeader({ title }: AdminHeaderProps) {
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
      {/* `display: contents` so the slot adds no box (and no gap) on pages that leave it empty. */}
      <Box id={TITLE_SLOT_ID} sx={{ display: 'contents' }} />
      <Stack
        direction="row"
        sx={{ ml: 'auto', alignItems: 'center', gap: '16px' }}
      >
        <IconButton aria-label="通知" sx={{ color: color.fg.neutral.subtle }}>
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
