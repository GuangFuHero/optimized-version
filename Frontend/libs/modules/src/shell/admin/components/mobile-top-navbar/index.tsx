'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { usePathname } from 'next/navigation';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

import { LAYOUT_DIMENSIONS } from '../layout/constants';
import { MenuGlyph } from '../menu-glyph';
import { MobileStationFilterBottomSheet } from '../mobile-station-filter-bottom-sheet';
import { MobileTicketFilterBottomSheet } from '../mobile-ticket-filter-bottom-sheet';

const SearchIcon = Icons.search;

interface MobileTopNavBarProps {
  onMenuClick: () => void;
}

const PATH_TITLE_MAP: Record<string, string> = {
  '/admin/tickets': '任務管理',
  '/admin/stations': '站點管理',
  '/admin/map': '地圖',
  '/admin/users': '用戶管理',
};

export function MobileTopNavBar({ onMenuClick }: MobileTopNavBarProps) {
  const pathname = usePathname();
  const topNavBarPalette =
    getRescueColorScheme(useTheme()).adminShell.topNavBar;
  const showTicketFilter = pathname?.startsWith('/admin/tickets') ?? false;
  const showStationFilter = pathname?.startsWith('/admin/stations') ?? false;

  return (
    <Box
      component="header"
      sx={{
        width: '100%',
        height: LAYOUT_DIMENSIONS.mobileTopNavBarHeight,
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr) 40px',
        alignItems: 'center',
        columnGap: 1,
        px: 2,
        bgcolor: topNavBarPalette.frame,
        borderBottom: `1px solid ${topNavBarPalette.border}`,
      }}
    >
      <ButtonBase
        disableRipple
        aria-label="開啟側欄"
        onClick={onMenuClick}
        sx={{
          width: 40,
          height: 40,
          borderRadius: '12px',
          color: topNavBarPalette.brandText,
          '&:hover': {
            bgcolor: topNavBarPalette.avatarHover,
          },
        }}
      >
        <MenuGlyph color={topNavBarPalette.brandText} />
      </ButtonBase>

      <Typography
        sx={{
          minWidth: 0,
          color: topNavBarPalette.brandText,
          fontSize: 17,
          lineHeight: '24px',
          fontWeight: 700,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {PATH_TITLE_MAP[pathname] ?? '島嶼守望後台'}
      </Typography>

      {showTicketFilter ? (
        <MobileTicketFilterBottomSheet />
      ) : showStationFilter ? (
        <MobileStationFilterBottomSheet />
      ) : (
        <ButtonBase
          disableRipple
          aria-label="搜尋票證、站點、地址"
          sx={{
            width: 40,
            height: 40,
            borderRadius: '12px',
            color: topNavBarPalette.brandText,
            '&:hover': {
              bgcolor: topNavBarPalette.avatarHover,
            },
          }}
        >
          <SearchIcon sx={{ width: 18, height: 18 }} />
        </ButtonBase>
      )}
    </Box>
  );
}
