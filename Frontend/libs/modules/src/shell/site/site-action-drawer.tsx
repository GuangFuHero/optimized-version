'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  useMediaQuery,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useId } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

/** The panel's width from `tablet` up (prototype `ActionDrawer`, site-actions.jsx:764). */
const DESKTOP_WIDTH_PX = 440;

/**
 * How tall the sheet may grow on a phone, leaving a strip of the page above it so it reads as a
 * sheet over the page. `vh` first for browsers without `dvh`; `dvh` then follows the address bar.
 */
const PHONE_SHEET_HEIGHT = { vh: '92vh', dvh: '92dvh' } as const;

export interface SiteActionDrawerProps {
  open: boolean;
  /** Also the dialog's accessible name. */
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Actions pinned under the content, e.g. the form's submit button. */
  footer?: ReactNode;
  /** The content fills the drawer itself instead of scrolling — the share panel's QR code. */
  fullHeight?: boolean;
}

/**
 * The public site's action drawer — 請求協助, 我的任務 and the rest (prototype `ActionDrawer`).
 *
 * A sheet from the bottom on a phone, a 440px panel on the right from `tablet` up: the same
 * `down('tablet')` cut the site's other phone/desktop switches use. Closing — the ✕, the scrim,
 * Escape — calls `onClose`; the drawer never closes itself. Its content unmounts once closed, so
 * each opening starts clean.
 */
export function SiteActionDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  fullHeight = false,
}: SiteActionDrawerProps) {
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down('tablet'));
  const titleId = useId();
  const padding = isPhone ? 2 : 3;

  return (
    <Drawer
      anchor={isPhone ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': titleId,
        },
      }}
      sx={{
        '& .MuiDrawer-paper': {
          display: 'flex',
          flexDirection: 'column',
          bgcolor: color.bg.neutral.default,
          boxShadow: shadow.lg,
          overflow: 'hidden',
          ...(isPhone
            ? {
                width: '100%',
                borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
                [fullHeight ? 'height' : 'maxHeight']: PHONE_SHEET_HEIGHT.vh,
                '@supports (height: 100dvh)': {
                  [fullHeight ? 'height' : 'maxHeight']: PHONE_SHEET_HEIGHT.dvh,
                },
              }
            : { width: `min(${DESKTOP_WIDTH_PX}px, 100vw)`, height: '100%' }),
        },
      }}
    >
      {isPhone ? (
        // A cue that the sheet can be put away; the ✕ and the scrim do the closing.
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            pt: 1,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: `${radius.full}px`,
              bgcolor: color.border.default,
            }}
          />
        </Box>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          flexShrink: 0,
          p: padding,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            id={titleId}
            component="h2"
            sx={{
              color: color.fg.neutral.default,
              fontSize: displayTextSize[20],
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              sx={{
                mt: 0.5,
                color: color.fg.neutral.subtle,
                fontSize: displayTextSize[13],
                lineHeight: 1.6,
                textWrap: 'pretty',
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {/* 44px: iOS's smallest comfortable target, nudged into the corner to spare the title. */}
        <IconButton
          aria-label="關閉"
          onClick={onClose}
          sx={{
            width: 44,
            height: 44,
            mt: -0.5,
            mr: -1,
            flexShrink: 0,
            color: color.fg.neutral.subtle,
          }}
        >
          <CloseRoundedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: fullHeight ? 'hidden' : 'auto',
          WebkitOverflowScrolling: 'touch',
          p: padding,
        }}
      >
        {children}
      </Box>

      {footer ? (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexShrink: 0,
            borderTop: `1px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.default,
            // On a phone the buttons clear the home indicator.
            ...(isPhone
              ? {
                  px: 2,
                  pt: 1.5,
                  pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                }
              : { px: 3, py: 2 }),
          }}
        >
          {footer}
        </Box>
      ) : null}
    </Drawer>
  );
}
