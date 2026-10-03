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
import { signOut } from 'next-auth/react';
import { Fragment } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useProjectSettings } from '@rescue-frontend/data-access/admin';

import {
  Badge,
  designTokens,
  layoutSizes,
  SidebarItem,
} from '@rescue-frontend/ui';

import { GuangFuBrandIcon } from '../../brand';
import { ADMIN_NAV_SECTIONS, type AdminNavItem } from './nav';

const { color, radius, typography, motion } = designTokens;

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeId?: string;
}

export function AdminSidebar({
  collapsed,
  onToggle,
  activeId,
}: AdminSidebarProps) {
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
      }}
    >
      <EventHeader collapsed={collapsed} onToggle={onToggle} />
      <RealmBar collapsed={collapsed} />

      <Stack
        component="nav"
        aria-label="後台導覽"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          gap: '6px',
          p: collapsed ? '16px 10px' : '16px',
          alignItems: collapsed ? 'center' : 'stretch',
        }}
      >
        {ADMIN_NAV_SECTIONS.filter((section) => !section.footer).map(
          (section, index) => (
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
          ),
        )}
      </Stack>

      <Stack
        sx={{
          gap: '6px',
          p: collapsed ? '14px 10px' : '14px 16px',
          alignItems: collapsed ? 'center' : 'stretch',
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {ADMIN_NAV_SECTIONS.filter((section) => section.footer).flatMap(
          (section) => section.items.map(renderItem),
        )}
        <SidebarItem
          icon={<LogOut />}
          label="登出"
          collapsed={collapsed}
          onClick={() => signOut({ callbackUrl: '/login?callbackUrl=/' })}
        />
      </Stack>
    </Box>
  );
}

function EventHeader({
  collapsed,
  onToggle,
}: Pick<AdminSidebarProps, 'collapsed' | 'onToggle'>) {
  const { data: settings, isPending, isError } = useProjectSettings();
  const name =
    settings?.name ??
    (isPending ? '載入中…' : isError ? '無法載入專案' : '尚未設定專案');
  const elapsedDays = settings?.started_at
    ? differenceInCalendarDays(new Date(), parseISO(settings.started_at))
    : -1;
  const day =
    Number.isFinite(elapsedDays) && elapsedDays >= 0 ? elapsedDays + 1 : null;
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
      sx={{ color: color.fg.neutral.default, borderRadius: `${radius.sm}px` }}
    >
      {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
    </IconButton>
  );

  if (collapsed) {
    return (
      <Stack
        title={[name, status].filter(Boolean).join('　')}
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
          title={name}
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

function RealmBar({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
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
          component={Link}
          href="/map"
          aria-label="回到前台"
          title="你在管理後台 · 回到前台（不會登出）"
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
      <Badge tone="neutral" title="你目前在管理後台">
        <Box
          component={ShieldCheck}
          sx={{ width: 12, height: 12, color: color.fg.neutral.muted }}
        />
        管理後台
      </Badge>
      <Box
        component={Link}
        href="/map"
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
    </Stack>
  );
}
