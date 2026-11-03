'use client';

import { Box, IconButton } from '@mui/material';
import { Bell } from 'lucide-react';
import { useState } from 'react';

import { designTokens } from '@rescue-frontend/ui';

import { AdminNotifySheet } from './admin-notify-sheet';

const { color } = designTokens;

/**
 * 通知 (prototype `WGNotifyBell`), in the admin top bar. No number on it yet: the label stays 通知.
 * The sheet rides with the bell.
 */
export function AdminNotifyBell() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        aria-label="通知"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        sx={{ color: color.fg.neutral.subtle, width: 44, height: 44 }}
      >
        <Box component={Bell} sx={{ width: 22, height: 22 }} />
      </IconButton>
      <AdminNotifySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
