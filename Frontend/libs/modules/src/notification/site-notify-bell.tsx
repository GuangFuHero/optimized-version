'use client';

import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import { Box, ButtonBase } from '@mui/material';
import { useState } from 'react';

import { designTokens } from '@rescue-frontend/ui';

import { bellLabel, unreadBadgeText } from './site-notices';
import { SiteNotifyDrawer } from './site-notify-drawer';
import {
  refreshUnreadSiteNotices,
  useUnreadSiteNotices,
} from './use-unread-site-notices';

const { color, radius, typography } = designTokens;

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
  const badge = unreadBadgeText(unread);
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
          refreshUnreadSiteNotices();
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
        {badge ? (
          <Box
            component="span"
            aria-hidden
            sx={{
              position: 'absolute',
              top: size === 40 ? 6 : 4,
              right: size === 40 ? 6 : 4,
              minWidth: 16,
              height: 16,
              px: '4px',
              display: 'grid',
              placeItems: 'center',
              boxSizing: 'border-box',
              borderRadius: `${radius.full}px`,
              bgcolor: color.bg.danger.default,
              color: color.fg.onDanger,
              boxShadow: `0 0 0 2px ${ringColor}`,
              fontFamily: typography.data[300].fontFamily,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {badge}
          </Box>
        ) : null}
      </ButtonBase>

      <SiteNotifyDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
