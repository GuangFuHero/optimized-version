'use client';

import { Box, InputBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

const SearchIcon = Icons.search;

export function TopNavBarSearch() {
  const topNavBarPalette =
    getRescueColorScheme(useTheme()).adminShell.topNavBar;

  return (
    <Box sx={{ width: '100%', maxWidth: 672, minWidth: 0 }}>
      <Box
        sx={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          pl: '12px',
          pr: '17px',
          border: `1px solid ${topNavBarPalette.searchBorder}`,
          borderRadius: '999px',
          bgcolor: topNavBarPalette.surface,
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
          '&:focus-within': {
            borderColor: topNavBarPalette.searchBorderFocus,
            boxShadow: '0 0 0 1px rgba(55, 65, 81, 0.14)',
          },
        }}
      >
        <SearchIcon
          aria-hidden
          sx={{
            width: 15,
            height: 15,
            display: 'block',
            flexShrink: 0,
            color: topNavBarPalette.brandText,
          }}
        />
        <InputBase
          value=""
          readOnly
          placeholder="搜尋事件、站點、地址..."
          inputProps={{
            'aria-label': '搜尋事件、站點、地址',
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            '& input': {
              p: 0,
              fontSize: 16,
              lineHeight: '20px',
              color: topNavBarPalette.searchText,
              '&::placeholder': {
                color: topNavBarPalette.searchText,
                opacity: 1,
              },
            },
          }}
        />
      </Box>
    </Box>
  );
}
