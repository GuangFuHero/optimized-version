'use client';

import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import { Box, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { GuangFuBrandIcon } from '../../../../brand';
import { authHeroTexture } from '../../assets/auth-hero-texture';
import { getAuthColorScheme } from '../../theme/auth-theme';

const { color, primitives } = designTokens;

interface AuthShellProps {
  children: ReactNode;
}

const authShellText = {
  brandName: '島嶼守望',
  heroTitle: '災民與志工，看同一張地圖',
  heroDescription:
    '登入之後才能請求協助、承接任務、提出站點的修改建議 —— 因為志工會依照你留的資訊到現場，來源必須追得到。',
  heroExit: '不登入，先去看地圖',
  phoneExit: '先看地圖',
} as const;

/**
 * Guests see the map and the list already — sign-in is asked for at sending, not at the door — so
 * the way there stays on every sign-in page, or the page reads as a wall (design `site-auth.jsx`).
 */
const MAP_HREF = '/map';

/**
 * The sign-in pages' frame (design `site.css` `.wg-auth`, `site-auth.jsx` `AuthHero`).
 * From 900px: the hero on the left — brand, what signing in is for, and the way to the map — over
 * the Figma photograph the design only stood in for. Below that the hero would push the form to a
 * second screen, so the phone gets no hero: the brand and the way to the map sit in a row above the
 * form instead, never both at once.
 */
export function AuthShell({ children }: AuthShellProps) {
  const authPalette = getAuthColorScheme(useTheme());

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(0, 1.05fr) minmax(0, 1fr)',
        },
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 4,
          px: 4,
          py: 6,
          borderRight: `1px solid ${authPalette.heroBorder}`,
          bgcolor: authPalette.heroBackground,
        }}
      >
        <Box
          component="img"
          src={authHeroTexture}
          alt=""
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: authPalette.heroDesktopOverlay,
          }}
        />

        <Stack
          direction="row"
          spacing={1.5}
          sx={{ position: 'relative', alignItems: 'center' }}
        >
          <GuangFuBrandIcon width={44} height={30} />
          <Typography
            sx={{
              color: color.fg.inverse,
              fontSize: displayTextSize[18],
              lineHeight: 1.4,
              fontWeight: 700,
            }}
          >
            {authShellText.brandName}
          </Typography>
        </Stack>

        <Stack spacing={2} sx={{ position: 'relative', maxWidth: 420 }}>
          <Typography
            component="h1"
            sx={{
              color: color.fg.inverse,
              fontSize: displayTextSize[24],
              lineHeight: 1.3,
              fontWeight: 700,
            }}
          >
            {authShellText.heroTitle}
          </Typography>
          <Typography
            sx={{
              color: primitives.color.neutral[200],
              fontSize: displayTextSize[15],
              lineHeight: 1.7,
            }}
          >
            {authShellText.heroDescription}
          </Typography>
        </Stack>

        <Box
          component={Link}
          href={MAP_HREF}
          sx={{
            position: 'relative',
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 44,
            textDecoration: 'none',
            color: primitives.color.blue[200],
            fontSize: displayTextSize[14],
            fontWeight: 700,
          }}
        >
          <MapOutlinedIcon sx={{ fontSize: 16 }} />
          {authShellText.heroExit}
        </Box>
      </Box>

      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: { md: 'center' },
          gap: 2,
          px: 2,
          py: 4,
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 440,
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box
            component={Link}
            href={MAP_HREF}
            sx={{
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              textDecoration: 'none',
            }}
          >
            <GuangFuBrandIcon width={38} height={26} />
            <Typography
              component="span"
              sx={{
                color: color.fg.neutral.default,
                fontSize: displayTextSize[16],
                lineHeight: 1.4,
                fontWeight: 700,
              }}
            >
              {authShellText.brandName}
            </Typography>
          </Box>
          <Box
            component={Link}
            href={MAP_HREF}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              minHeight: 44,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              color: color.brand.primary.subtle,
              fontSize: displayTextSize[13],
              fontWeight: 700,
            }}
          >
            <MapOutlinedIcon sx={{ fontSize: 16 }} />
            {authShellText.phoneExit}
          </Box>
        </Box>

        <Box sx={{ width: '100%', maxWidth: 440 }}>{children}</Box>
      </Box>
    </Box>
  );
}
