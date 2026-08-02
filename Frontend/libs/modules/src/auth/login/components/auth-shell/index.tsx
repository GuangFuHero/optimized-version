'use client';

import { Box, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

import { authHeroTexture } from '../../assets/auth-hero-texture';
import { getAuthColorScheme } from '../../theme/auth-theme';

interface AuthShellProps {
  children: ReactNode;
}

const authShellText = {
  heroTitle: '即時災情協作指揮',
  heroDescription:
    '整合任務、站點與資源調度資訊。\n讓現場與指揮中心在同一張地圖上\n同步掌握最新態勢。',
} as const;

export function AuthShell({ children }: AuthShellProps) {
  const authPalette = getAuthColorScheme(useTheme());

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        position: 'relative',
        display: 'flex',
        overflow: 'hidden',
        bgcolor: {
          xs: authPalette.heroBackground,
          md: authPalette.pageBackground,
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: { xs: 'none', md: 'flex' },
          flex: { md: '0 0 50%' },
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
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
            left: '50%',
            top: '50%',
            width: { xs: '100dvw', md: '50dvw' },
            minHeight: '100dvh',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            transform: 'translate(-50%, -50%)',
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
          spacing={1}
          sx={{
            position: 'absolute',
            left: 32,
            bottom: 32,
            zIndex: 1,
            maxWidth: 448,
            pr: 3,
          }}
        >
          <Typography
            variant="h3"
            sx={{
              color: 'common.white',
              fontSize: 32,
              lineHeight: '40px',
              fontWeight: 700,
              letterSpacing: '-0.8px',
            }}
          >
            {authShellText.heroTitle}
          </Typography>
          <Typography
            sx={{
              fontSize: 18,
              lineHeight: '28px',
              color: authPalette.heroBody,
              opacity: 0.86,
              whiteSpace: 'pre-line',
            }}
          >
            {authShellText.heroDescription}
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: { xs: 'block', md: 'none' },
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <Box
          component="img"
          src={authHeroTexture}
          alt=""
          aria-hidden
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '100dvw',
            height: '100dvh',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: authPalette.heroMobileOverlay,
          }}
        />
      </Box>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: { xs: '1 1 100%', md: '0 0 50%' },
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          p: { xs: 3, sm: 4, md: 4 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 448 }}>{children}</Box>
      </Box>
    </Box>
  );
}
