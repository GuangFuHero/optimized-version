'use client';

import { Suspense, useCallback, useState, type ReactNode } from 'react';

import { Box, Drawer } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { usePathname } from 'next/navigation';

import { getRescueColorScheme, layoutSizes } from '@rescue-frontend/ui';

import { SITE_BANNER_HEIGHT, SiteAnnouncementBanner } from '../../announcement';
import { SiteMapRouteProvider } from '../../map/site/use-site-map-route-state';
import {
  RoleRequestDrawer,
  sitePortalEntry,
  useMyRoleRequests,
} from '../../role-request';
import type { ApplyReturn } from '../../role-request/apply-return';
import { RoleRequestReturn } from '../../role-request/role-request-return';
import { SiteRouteProvider } from '../../route/use-site-route-state';
import { StationSuggestionHost } from '../../station/suggestion/station-suggestion-host';
import { HelpRequestHost } from '../../ticket/help-request/help-request-host';
import { MobileRequestHelpFab } from '../../ticket/help-request/mobile-request-help';
import { SiteMobileTopNavBar } from './mobile-top-navbar';
import { PageHelpDialog, usePageHelp } from './page-help';
import { SiteSidebar } from './sidebar';
import { SiteTopNavBar } from './top-navbar';

interface SiteShellProps {
  children: ReactNode;
  isAuthenticated?: boolean;
  userName?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

/**
 * 前台外殼：使用單一 responsive layout，避免在 JS 依 breakpoint 切換整份 UI，
 * 減少 SSR 與 hydration 期間先渲染預設版面再跳版的情況。
 */
export function SiteShell({
  children,
  isAuthenticated = false,
  userName,
  onSignIn,
  onSignOut,
}: SiteShellProps) {
  const pathname = usePathname();
  const rescue = getRescueColorScheme(useTheme());
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  // 前往管理平台 / 申請管理權限: asked once here, shown in the top bar or the phone's menu, and
  // the application drawer the latter opens.
  const { myRoleRequests, refetch: refetchRoleRequests } =
    useMyRoleRequests(isAuthenticated);
  const portalEntry = sitePortalEntry(isAuthenticated, myRoleRequests);
  const [roleRequestOpen, setRoleRequestOpen] = useState(false);
  const openRoleRequest = () => {
    // From the phone's menu: the menu gives way to the drawer rather than sit under it.
    setMobileDrawerOpen(false);
    setRoleRequestOpen(true);
  };
  // Back from proving the person at LINE before adding a phone: the form opens again as it was.
  const [applyReturn, setApplyReturn] = useState<ApplyReturn | null>(null);
  const reopenRoleRequest = useCallback((back: ApplyReturn) => {
    setApplyReturn(back);
    setRoleRequestOpen(true);
  }, []);
  const clearApplyReturn = useCallback(() => setApplyReturn(null), []);
  // 這一頁怎麼用 on a phone, from the menu's row: the desktop's ？ holds its own.
  const pageHelp = usePageHelp();
  const [pageHelpOpen, setPageHelpOpen] = useState(false);
  const desktopSidebarWidth = desktopSidebarOpen
    ? layoutSizes.site.expandedSidebarWidth
    : layoutSizes.site.collapsedSidebarWidth;

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
          mobile: `${layoutSizes.site.mobileTopNavBarHeight}px minmax(0, 1fr)`,
          tablet: `${layoutSizes.site.desktopTopNavBarHeight}px minmax(0, 1fr)`,
        },
        // The announcement banner above pushes the page down, not its foot off the screen.
        height: `calc(100dvh - ${SITE_BANNER_HEIGHT})`,
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
          portalEntry={portalEntry}
          onApplyRoleRequest={openRoleRequest}
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
          collapsed={!desktopSidebarOpen}
          isAuthenticated={isAuthenticated}
          onSignIn={onSignIn}
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
          onClose={() => setMobileDrawerOpen(false)}
          onSignOut={onSignOut}
          portalEntry={portalEntry}
          onApplyRoleRequest={openRoleRequest}
          pageHelp={
            pageHelp
              ? {
                  fresh: pageHelp.fresh,
                  onOpen: () => {
                    pageHelp.markSeen();
                    setPageHelpOpen(true);
                  },
                }
              : undefined
          }
        />
      </Drawer>

      <PageHelpDialog
        open={pageHelpOpen}
        onClose={() => setPageHelpOpen(false)}
      />

      <RoleRequestDrawer
        open={roleRequestOpen}
        onClose={() => setRoleRequestOpen(false)}
        myRoleRequests={myRoleRequests}
        onSubmitted={refetchRoleRequests}
        applyReturn={applyReturn}
        onApplyReturnHandled={clearApplyReturn}
      />
      <Suspense fallback={null}>
        <RoleRequestReturn onReturn={reopenRoleRequest} />
      </Suspense>

      {/* The map has its own, clear of its 「＋」 (`MapRequestHelpButton`). */}
      {pathname.startsWith('/map') ? null : <MobileRequestHelpFab />}

      {/* Inside the route providers: once a ticket is filed it turns the page to it. */}
      <HelpRequestHost isAuthenticated={isAuthenticated} />

      {/* Opened from a station's detail, on the map or the list (`openStationSuggestion`). */}
      <StationSuggestionHost isAuthenticated={isAuthenticated} />
    </Box>
  );

  return (
    <>
      {/* Above the whole page (prototype `site-shell.jsx:670-676`), and outside the route
          providers, so going between the map and the list does not take it down and up again. */}
      <SiteAnnouncementBanner />
      {pathname.startsWith('/map') ? (
        <SiteMapRouteProvider>{content}</SiteMapRouteProvider>
      ) : (
        <SiteRouteProvider>{content}</SiteRouteProvider>
      )}
    </>
  );
}
