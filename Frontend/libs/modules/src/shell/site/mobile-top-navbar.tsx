'use client';

import { Suspense } from 'react';

import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import { Box, ButtonBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { LAYOUT_DIMENSIONS } from '../layout';
import { MenuGlyph } from '../menu-glyph';
import {
  SiteHeaderSearchInput,
  SiteHeaderSearchInputFallback,
} from './header-search-input';
import { SiteUserMenu } from './user-menu';

interface SiteMobileTopNavBarProps {
  isAuthenticated?: boolean;
  onMenuClick: () => void;
  userName?: string;
  userImage?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

/**
 * 前台行動版頂部導覽列：左側選單鈕開啟側欄抽屜、中央顯示目前模組、右側為使用者選單。
 */
export function SiteMobileTopNavBar({
  isAuthenticated = false,
  onMenuClick,
  userName,
  userImage,
  onSignIn,
  onSignOut,
}: SiteMobileTopNavBarProps) {
  const palette = getRescueColorScheme(useTheme()).adminShell.topNavBar;

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
        bgcolor: palette.frame,
        borderBottom: `1px solid ${palette.border}`,
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
          color: palette.brandText,
          '&:hover': {
            bgcolor: palette.avatarHover,
          },
        }}
      >
        <MenuGlyph color={palette.brandText} />
      </ButtonBase>

      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Suspense fallback={<SiteHeaderSearchInputFallback compact />}>
          <SiteHeaderSearchInput compact />
        </Suspense>
      </Box>

      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        {isAuthenticated ? (
          <SiteUserMenu
            userName={userName}
            userImage={userImage}
            onSignOut={onSignOut}
          />
        ) : (
          <ButtonBase
            disableRipple
            aria-label="登入"
            onClick={onSignIn}
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              color: palette.brandText,
              '&:hover': {
                bgcolor: palette.avatarHover,
              },
            }}
          >
            <LoginRoundedIcon sx={{ fontSize: 22 }} />
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
