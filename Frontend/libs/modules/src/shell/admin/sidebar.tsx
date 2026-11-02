'use client';

import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  ArrowLeftRight,
  ShieldCheck,
} from 'lucide-react';

import { Box, Divider, IconButton, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { Fragment } from 'react';
import { toast } from 'sonner';
import {
  useCapability,
  useProjectSettings,
} from '@rescue-frontend/data-access/admin';

import {
  Badge,
  designTokens,
  layoutSizes,
  SidebarItem,
} from '@rescue-frontend/ui';

import {
  SIGN_OUT_FAILED_MESSAGE,
  signOutHereAsync,
} from '../../auth/session/sign-out';
import { GuangFuBrandIcon } from '../../brand';
import { siteBrandName } from '../site/event-name';
import { eventDayNumber } from './event-day';
import { useAdminNavSections, type AdminNavItem } from './nav';
import { siteMapUrl } from './site-map-url';

const { color, radius, typography, motion } = designTokens;

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeId?: string;
  /** The site's origin (`SITE_APP_URL`), for 回到前台; without it there is no link. */
  siteUrl?: string;
}

export function AdminSidebar({
  collapsed,
  onToggle,
  activeId,
  siteUrl,
}: AdminSidebarProps) {
  const sections = useAdminNavSections();
  const renderItem = (item: AdminNavItem) => (
    <SidebarItem
      key={item.id}
      LinkComponent={Link}
      href={item.href}
      icon={<item.Icon />}
      label={item.label}
      active={item.id === activeId}
      collapsed={collapsed}
    />
  );

  return (
    <Box
      component="aside"
      sx={{
        width: collapsed
          ? layoutSizes.admin.collapsedSidebarWidth
          : layoutSizes.admin.expandedSidebarWidth,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: color.bg.neutral.subtle,
        borderRight: `1px solid ${color.border.default}`,
        transition: `width ${motion.transition.base}`,
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <EventHeader collapsed={collapsed} onToggle={onToggle} />
      <RealmBar collapsed={collapsed} siteUrl={siteUrl} />

      <Stack
        component="nav"
        aria-label="管理平台導覽"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          gap: '6px',
          p: collapsed ? '16px 10px' : '16px',
          alignItems: collapsed ? 'center' : 'stretch',
        }}
      >
        {sections
          .filter((section) => !section.footer)
          .map((section, index) => (
            <Fragment key={section.label ?? index}>
              {section.label ? (
                <Box
                  sx={{
                    alignSelf: 'stretch',
                    m: collapsed ? '12px 0 2px' : '14px 8px 2px',
                  }}
                >
                  <Divider sx={{ borderColor: color.border.default }} />
                  {collapsed ? null : (
                    <Typography
                      sx={{
                        mt: '12px',
                        ...typography.label[300],
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        color: color.fg.neutral.muted,
                      }}
                    >
                      {section.label}
                    </Typography>
                  )}
                </Box>
              ) : null}
              {section.items.map(renderItem)}
            </Fragment>
          ))}
      </Stack>

      <Stack
        sx={{
          gap: '6px',
          p: collapsed ? '14px 10px' : '14px 16px',
          alignItems: collapsed ? 'center' : 'stretch',
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {sections
          .filter((section) => section.footer)
          .flatMap((section) => section.items.map(renderItem))}
        <SidebarItem
          icon={<LogOut />}
          label="登出"
          collapsed={collapsed}
          onClick={() => {
            void signOutHereAsync().then((outcome) => {
              if (outcome === 'still-signed-in') {
                toast.error(SIGN_OUT_FAILED_MESSAGE);
              }
            });
          }}
        />
      </Stack>
    </Box>
  );
}

function EventHeader({
  collapsed,
  onToggle,
}: Pick<AdminSidebarProps, 'collapsed' | 'onToggle'>) {
  const { data: canViewProject = false } = useCapability('project.view');
  const {
    data: projectSettings,
    isPending,
    isError,
  } = useProjectSettings({ enabled: canViewProject });
  const settings = canViewProject ? projectSettings : undefined;
  const eventName = settings?.name
    ? siteBrandName({ name: settings.name, shortName: settings.short_name })
    : null;
  const name =
    eventName?.label ??
    (!canViewProject
      ? '管理平台'
      : isPending
        ? '載入中…'
        : isError
          ? '無法載入專案'
          : '尚未設定專案');
  const fullName = eventName?.fullName ?? name;
  const day = eventDayNumber(settings?.started_at, new Date());
  const status = day == null ? null : `進行中 · 第 ${day} 天`;
  const statusDot = (
    <Box
      component="span"
      sx={{
        width: 7,
        height: 7,
        flexShrink: 0,
        borderRadius: `${radius.full}px`,
        bgcolor: color.brand.primary.default,
      }}
    />
  );
  const toggleButton = (
    <IconButton
      aria-label={collapsed ? '展開選單' : '收合選單'}
      onClick={onToggle}
      sx={{
        width: 44,
        height: 44,
        color: color.fg.neutral.default,
        borderRadius: `${radius.sm}px`,
      }}
    >
      {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
    </IconButton>
  );

  if (collapsed) {
    return (
      <Stack
        title={[fullName, status].filter(Boolean).join('　')}
        sx={{
          alignItems: 'center',
          gap: '8px',
          p: '14px 0 12px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <GuangFuBrandIcon width={36} height={26} />
        {status ? statusDot : null}
        {toggleButton}
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        p: '16px 20px 14px',
        borderBottom: `1px solid ${color.border.default}`,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: '10px' }}>
        <GuangFuBrandIcon width={36} height={26} />
        <Typography
          noWrap
          title={fullName}
          sx={{
            flex: 1,
            minWidth: 0,
            ...typography.label[500],
            fontSize: 18,
            color: color.fg.neutral.default,
          }}
        >
          {name}
        </Typography>
        {toggleButton}
      </Stack>
      {status ? (
        <Stack
          direction="row"
          sx={{
            mt: '8px',
            alignItems: 'center',
            gap: '6px',
            ...typography.data[300],
            color: color.fg.neutral.muted,
          }}
        >
          {statusDot}
          <Box
            component="span"
            sx={{ fontWeight: 700, color: color.fg.neutral.default }}
          >
            進行中
          </Box>
          · 第 {day} 天
        </Stack>
      ) : null}
    </Box>
  );
}

/** 回到前台 opens the site's map in a new window, so the back office stays open where it was. */
function RealmBar({
  collapsed,
  siteUrl,
}: {
  collapsed: boolean;
  siteUrl?: string;
}) {
  const siteMap = siteMapUrl(siteUrl);

  if (collapsed) {
    if (!siteMap) return null;
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          py: '10px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <IconButton
          component="a"
          href={siteMap}
          target="_blank"
          rel="noopener"
          aria-label="回到公開地圖"
          // On hover, as the collapsed nav items show their label, and in the expanded link's words.
          title="回到前台（不會登出）"
          sx={{
            color: color.fg.neutral.subtle,
            borderRadius: `${radius.sm}px`,
          }}
        >
          <Box component={ArrowLeftRight} sx={{ width: 18, height: 18 }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        p: '9px 20px',
        borderBottom: `1px solid ${color.border.default}`,
      }}
    >
      <Badge tone="neutral">
        <Box
          component={ShieldCheck}
          sx={{ width: 12, height: 12, color: color.fg.neutral.muted }}
        />
        管理平台
      </Badge>
      {siteMap ? (
        <Box
          component="a"
          href={siteMap}
          target="_blank"
          rel="noopener"
          title="回到前台（不會登出）"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            ...typography.data[300],
            fontWeight: 700,
            color: color.fg.neutral.muted,
            textDecoration: 'none',
          }}
        >
          回到前台
          <Box component={ArrowLeftRight} sx={{ width: 13, height: 13 }} />
        </Box>
      ) : null}
    </Stack>
  );
}
