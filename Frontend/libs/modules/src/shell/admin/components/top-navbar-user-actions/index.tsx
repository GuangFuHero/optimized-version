'use client';

import { Box, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

const UserAvatarMarkIcon = Icons.userAvatarMark;

export function TopNavBarUserActions() {
  const topNavBarPalette =
    getRescueColorScheme(useTheme()).adminShell.topNavBar;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          minWidth: 'fit-content',
          height: 40,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: '13px',
          border: `1px solid ${topNavBarPalette.border}`,
          borderRadius: '999px',
        }}
      >
        <Typography
          sx={{
            color: topNavBarPalette.roleText,
            fontSize: 16,
            lineHeight: '24px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          管理後台
        </Typography>
      </Box>
    </Stack>
  );
}
