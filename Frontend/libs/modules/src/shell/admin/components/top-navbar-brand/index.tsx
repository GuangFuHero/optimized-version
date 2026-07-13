'use client';

import { Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { GuangFuBrandIcon } from '../../../../brand';

export function TopNavBarBrand() {
  const topNavBarPalette =
    getRescueColorScheme(useTheme()).adminShell.topNavBar;

  return (
    <Stack
      sx={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1.25,
      }}
    >
      <GuangFuBrandIcon width={38} height={26} />
      <Typography
        sx={{
          color: topNavBarPalette.brandText,
          fontSize: 16,
          lineHeight: '24px',
          fontWeight: 700,
          letterSpacing: 0,
          whiteSpace: 'nowrap',
        }}
      >
        島嶼守望
      </Typography>
    </Stack>
  );
}
