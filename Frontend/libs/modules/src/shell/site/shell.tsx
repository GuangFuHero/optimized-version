'use client';

import { useState, type ReactNode } from 'react';

import { Box, Drawer, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { usePathname } from 'next/navigation';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { LAYOUT_DIMENSIONS } from '../layout';
import { GuangFuBrandIcon } from '../../brand';
import { SiteMapRouteProvider } from '../../map/site/use-site-map-route-state';
import { SiteRouteProvider } from '../../route/use-site-route-state';
import { SiteMobileTopNavBar } from './mobile-top-navbar';
import { SiteSidebar } from './sidebar';
import { SiteTopNavBar } from './top-navbar';

interface SiteShellProps {
  children: ReactNode;
  isAuthenticated?: boolean;
  userName?: string;
  userImage?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

const SITE_EXPANDED_SIDEBAR_WIDTH = 240;

/**
 * 前台外殼：使用單一 responsive layout，避免在 JS 依 breakpoint 切換整份 UI，
 * 減少 SSR 與 hydration 期間先渲染預設版面再跳版的情況。
 */
export function SiteShell({
  children,
  isAuthenticated = false,
  userName,
  userImage,
  onSignIn,
  onSignOut,
}: SiteShellProps) {
  const pathname = usePathname();
  const rescue = getRescueColorScheme(useTheme());
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const bodyMinHeight = `calc(100dvh - ${LAYOUT_DIMENSIONS.desktopTopNavBarHeight}px)`;
  const desktopSidebarWidth = desktopSidebarOpen
    ? SITE_EXPANDED_SIDEBAR_WIDTH
    : LAYOUT_DIMENSIONS.collapsedSidebarWidth;

  const mobileSidebarBrand = (
    <Stack
      sx={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1.25,
        minWidth: 0,
      }}
    >
      <GuangFuBrandIcon width={38} height={26} />
      <Typography
        sx={{
          minWidth: 0,
          color: rescue.adminShell.sidebar.heading,
          fontSize: 20,
          lineHeight: '28px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        島嶼守望
      </Typography>
    </Stack>
  );

  const content = (
    <Box
      sx={{
        display: 'grid',
        position: 'relative',
        isolation: 'isolate',
        gridTemplateColumns: {
          mobile: 'minmax(0, 1fr)',
          tablet: `${desktopSidebarWidth}px minmax(0, 1fr)`,
        },
        gridTemplateRows: {
          mobile: `${LAYOUT_DIMENSIONS.mobileTopNavBarHeight}px minmax(0, 1fr)`,
          tablet: `${LAYOUT_DIMENSIONS.desktopTopNavBarHeight}px minmax(0, 1fr)`,
        },
        height: '100dvh',
        bgcolor: rescue.adminShell.topNavBar.frame,
        transition: {
          mobile: 'none',
          tablet: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      }}
    >
      <Box
        sx={{
          gridColumn: '1 / -1',
          gridRow: 1,
          minWidth: 0,
          position: 'relative',
          zIndex: 3,
          display: { mobile: 'none', tablet: 'block' },
        }}
      >
        <SiteTopNavBar
          isAuthenticated={isAuthenticated}
          userName={userName}
          userImage={userImage}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      </Box>

      <Box
        sx={{
          gridColumn: '1 / -1',
          gridRow: 1,
          minWidth: 0,
          display: { mobile: 'block', tablet: 'none' },
        }}
      >
        <SiteMobileTopNavBar
          isAuthenticated={isAuthenticated}
          onMenuClick={() => setMobileDrawerOpen(true)}
          userName={userName}
          userImage={userImage}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      </Box>

      <Box
        onMouseEnter={() => setDesktopSidebarOpen(true)}
        onMouseLeave={() => setDesktopSidebarOpen(false)}
        onFocusCapture={() => setDesktopSidebarOpen(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;

          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(nextTarget)
          ) {
            return;
          }

          setDesktopSidebarOpen(false);
        }}
        sx={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          zIndex: 2,
          display: { mobile: 'none', tablet: 'block' },
        }}
      >
        <SiteSidebar
          isAuthenticated={isAuthenticated}
          onSignIn={onSignIn}
          open={desktopSidebarOpen}
          width={SITE_EXPANDED_SIDEBAR_WIDTH}
          collapsedWidth={LAYOUT_DIMENSIONS.collapsedSidebarWidth}
          minHeight={bodyMinHeight}
          onSignOut={onSignOut}
        />
      </Box>

      <Box
        component="main"
        sx={{
          gridColumn: { mobile: 1, tablet: 2 },
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          zIndex: 0,
        }}
      >
        {children}
      </Box>

      <Drawer
        anchor="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { mobile: 'block', tablet: 'none' },
          '& .MuiDrawer-paper': {
            width: 'min(320px, calc(100vw - 40px))',
            maxWidth: 'calc(100vw - 40px)',
            overflow: 'hidden',
            bgcolor: 'transparent',
          },
        }}
      >
        <SiteSidebar
          isAuthenticated={isAuthenticated}
          onSignIn={onSignIn}
          open
          width="100%"
          minHeight="100dvh"
          headerContent={mobileSidebarBrand}
          showCloseButton
          onClose={() => setMobileDrawerOpen(false)}
          onSignOut={onSignOut}
        />
      </Drawer>
    </Box>
  );

  return pathname.startsWith('/map') ? (
    <SiteMapRouteProvider>{content}</SiteMapRouteProvider>
  ) : (
    <SiteRouteProvider>{content}</SiteRouteProvider>
  );
}
