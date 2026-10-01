'use client';

import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import { ButtonBase, type SxProps, type Theme } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { openHelpRequest } from './open-help-request';

const { color, radius, shadow } = designTokens;

/**
 * 請求協助 on a phone, where the top bar has no room for it (prototype `SiteMobileHelpFab`,
 * `site-shell.jsx:505-546`): the reason the site is there for residents, so not buried in the menu
 * — every extra tap is a chance to give up. Phones only; a wider screen has the top bar's button.
 */
function RequestHelpPill({ sx }: { sx: SxProps<Theme> }) {
  return (
    <ButtonBase
      onClick={() => openHelpRequest()}
      sx={[
        {
          display: { mobile: 'inline-flex', tablet: 'none' },
          alignItems: 'center',
          gap: 1,
          height: 52,
          maxWidth: 'calc(100vw - 32px)',
          px: 2,
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.primary.default,
          color: color.fg.onPrimary,
          boxShadow: shadow.lg,
          fontSize: displayTextSize[15],
          fontWeight: 700,
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: color.bg.primary.hover },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <HandshakeRoundedIcon sx={{ fontSize: 20 }} />
      請求協助
    </ButtonBase>
  );
}

/**
 * In the thumb's corner of every page but the map, which has its own (`MapRequestHelpButton`),
 * clear of an iPhone's home indicator. The menu and the detail drawer cover it as modals do.
 */
export function MobileRequestHelpFab() {
  return (
    <RequestHelpPill
      sx={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        zIndex: 4,
      }}
    />
  );
}

/**
 * The map's, at the middle of its foot: the right corner holds the map's 「＋」. Floating, not the
 * prototype's bar along the bottom — that bar was there because pinned filters sat at the bottom
 * then, and here they sit at the top (spec S2, decided 2026-10-01).
 */
export function MapRequestHelpButton() {
  return (
    <RequestHelpPill
      sx={{
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: 'translateX(-50%)',
        zIndex: 1200,
      }}
    />
  );
}
