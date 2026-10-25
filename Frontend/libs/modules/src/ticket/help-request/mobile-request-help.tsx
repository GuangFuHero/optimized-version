'use client';

import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import { Box, ButtonBase, type SxProps, type Theme } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { openHelpRequest } from './open-help-request';

const { color, radius, shadow } = designTokens;

/**
 * 請求協助 on a phone, where the top bar has no room for it (prototype `SiteMobileHelpFab`,
 * `site-shell.jsx:546-583`): the reason the site is there for residents, so not buried in the menu
 * — every extra tap is a chance to give up. Phones only; a wider screen has the top bar's button.
 */
function RequestHelpPill({
  iconSize,
  sx,
}: {
  iconSize: number;
  sx: SxProps<Theme>;
}) {
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
      <HandshakeRoundedIcon sx={{ fontSize: iconSize }} />
      請求協助
    </ButtonBase>
  );
}

/**
 * In the thumb's corner of every page but the map, which has its own (`MapRequestHelpBar`),
 * clear of an iPhone's home indicator. The menu and the detail drawer cover it as modals do.
 */
export function MobileRequestHelpFab() {
  return (
    <RequestHelpPill
      iconSize={designTokens.iconSize.lg}
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
 * The map's, a bar across its foot holding one full-width button (prototype `SiteMapControls`,
 * `site-map.jsx:890-908`): the choices — which kind, which filters, which layers — sit at the top,
 * and the one thing to do sits at the bottom. Under the map rather than over it, so the map's scale,
 * its attribution and its 「＋」 stay in sight above it.
 */
export function MapRequestHelpBar() {
  return (
    <Box
      sx={{
        display: { mobile: 'flex', tablet: 'none' },
        px: 1.5,
        pt: 1,
        pb: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        bgcolor: color.bg.neutral.default,
        borderTop: `1px solid ${color.border.default}`,
      }}
    >
      <RequestHelpPill
        iconSize={designTokens.iconSize.md}
        sx={{
          flex: 1,
          justifyContent: 'center',
          gap: 0.75,
          height: 48,
          maxWidth: 'none',
          boxShadow: 'none',
        }}
      />
    </Box>
  );
}
