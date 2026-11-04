'use client';

import { Box, IconButton } from '@mui/material';
import { Bell } from 'lucide-react';
import { useState } from 'react';

import { CountBadge, designTokens } from '@rescue-frontend/ui';

import { AdminNotifySheet } from './admin-notify-sheet';
import { bellLabel } from './site-notices';
import { useAdminNotifyBadge } from './use-admin-notify-badge';

const { color } = designTokens;

/**
 * 通知 (prototype `WGNotifyBell`), in the admin top bar. Its number is what came in since the list
 * was last opened; opening clears it and marks nothing read. The sheet rides with the bell.
 */
export function AdminNotifyBell() {
  const { count, markSeen } = useAdminNotifyBadge();
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        aria-label={bellLabel(count, '新通知')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          markSeen();
          setOpen(true);
        }}
        sx={{
          position: 'relative',
          color: color.fg.neutral.subtle,
          width: 44,
          height: 44,
        }}
      >
        <Box component={Bell} sx={{ width: 22, height: 22 }} />
        {/* The prototype's 18px badge at the bell's top right (top −1, right −3 of the icon), ringed by the bar. */}
        {count > 0 ? (
          <CountBadge
            count={count}
            max={99}
            tone="danger"
            aria-hidden
            sx={{
              position: 'absolute',
              top: 10,
              right: 8,
              boxShadow: `0 0 0 2px ${color.bg.neutral.default}`,
            }}
          />
        ) : null}
      </IconButton>
      <AdminNotifySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
