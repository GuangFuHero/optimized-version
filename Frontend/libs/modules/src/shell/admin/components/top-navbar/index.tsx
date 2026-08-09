'use client';

import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { TopNavBarBrand } from '../top-navbar-brand';
import { TopNavBarSearch } from '../top-navbar-search';
import { TopNavBarUserActions } from '../top-navbar-user-actions';

export function TopNavBar() {
  const topNavBarPalette =
    getRescueColorScheme(useTheme()).adminShell.topNavBar;

  return (
    <Box
      component="header"
      sx={{
        width: '100%',
        minWidth: 0,
        height: 64,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 3,
        px: { xs: 3, tablet: '16px', desktop: '32px' },
        bgcolor: topNavBarPalette.frame,
        borderBottom: `1px solid ${topNavBarPalette.border}`,
      }}
    >
      <TopNavBarBrand />
      <Box sx={{ minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        <TopNavBarSearch />
      </Box>
      <TopNavBarUserActions />
    </Box>
  );
}
