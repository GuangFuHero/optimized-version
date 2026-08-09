'use client';

import { Box, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { GuangFuBrandIcon } from '../../../../brand';
import { getAuthColorScheme } from '../../theme/auth-theme';

const brandHeaderText = {
  brandName: '島嶼守望',
  subtitle: '登入',
} as const;

export function AuthBrandHeader() {
  const authPalette = getAuthColorScheme(useTheme());

  return (
    <Stack spacing={2} sx={{ width: '100%', px: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <GuangFuBrandIcon width={48} height={32} />
        <Typography
          component="h1"
          sx={{
            color: authPalette.textPrimary,
            fontSize: 32,
            lineHeight: '40px',
            fontWeight: 700,
            letterSpacing: '-0.8px',
          }}
        >
          {brandHeaderText.brandName}
        </Typography>
      </Box>

      {/* <Typography
        sx={{
          color: authPalette.textSecondary,
          fontSize: 16,
          lineHeight: '24px',
        }}
      >
        {brandHeaderText.subtitle}
      </Typography> */}
    </Stack>
  );
}
