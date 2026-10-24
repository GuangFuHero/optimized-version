'use client';

import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import { ButtonBase } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CountBadge, designTokens } from '@rescue-frontend/ui';

import { siteNotificationKeys } from './api';
import { bellLabel } from './site-notices';
import { SiteNotifyDrawer } from './site-notify-drawer';
import { useUnreadSiteNotices } from './use-unread-site-notices';

const { color } = designTokens;

interface SiteNotifyBellProps {
  /** As big as its neighbours: the desktop bar's ？ (36), the phone bar's buttons (40). */
  size: 36 | 40;
  /** The bar behind it, ringing the badge so it stands off the bell. */
  ringColor: string;
}

/**
 * 通知 (prototype `SiteNotifyBell`, `site-notify.jsx:120-148`), beside the account in both top bars,
 * for a signed-in viewer only: a guest has nothing addressed to them, and a bell they could not open
 * would say otherwise. The drawer rides with the bell, as 我的任務 does with the account menu.
 */
export function SiteNotifyBell({ size, ringColor }: SiteNotifyBellProps) {
  const unread = useUnreadSiteNotices();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ButtonBase
        aria-label={bellLabel(unread)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          // The drawer reads the notices afresh; the badge follows rather than waiting a minute.
          void queryClient.invalidateQueries({
            queryKey: siteNotificationKeys.unread,
          });
        }}
        sx={{
          position: 'relative',
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          color: open ? color.brand.primary.subtle : color.fg.neutral.subtle,
          bgcolor: open ? color.bg.primary.subtle : 'transparent',
          transition: 'background-color 120ms ease',
          '&:hover': {
            bgcolor: open ? color.bg.primary.subtle : color.bg.neutral.subtle,
          },
        }}
      >
        <NotificationsNoneRoundedIcon sx={{ fontSize: 24 }} />
        {/* 9+ past nine, as the prototype's 16px dot holds; none at zero, where CountBadge says 0. */}
        {unread > 0 ? (
          <CountBadge
            count={unread}
            max={9}
            tone="danger"
            aria-hidden
            sx={{
              position: 'absolute',
              top: size === 40 ? 6 : 4,
              right: size === 40 ? 6 : 4,
              minWidth: 16,
              height: 16,
              px: '4px',
              boxShadow: `0 0 0 2px ${ringColor}`,
              fontSize: 10,
            }}
          />
        ) : null}
      </ButtonBase>

      <SiteNotifyDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
