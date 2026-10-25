'use client';

import type { ReactNode } from 'react';

import { Box, ButtonBase, Drawer, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { X } from 'lucide-react';

const { color, radius, shadow, typography } = designTokens;

/** The prototype's `StationDrawer` width (`station-drawer.jsx`). */
export const ADMIN_STATION_DRAWER_WIDTH = 540;

/**
 * `/stations`' one right-hand drawer. Detail, edit and create all render inside it, so switching
 * from viewing a station to editing it swaps the content instead of stacking a second sheet.
 * Admin-only: the maps keep the shared `Sheet` look.
 */
export function AdminStationDrawer({
  open,
  onClose,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-label': ariaLabel,
          sx: {
            width: `min(${ADMIN_STATION_DRAWER_WIDTH}px, 100vw)`,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
          },
        },
      }}
    >
      {children}
    </Drawer>
  );
}

export interface AdminStationDrawerLayoutProps {
  /** The small line over the title: the station's type, or 「新增」. */
  eyebrow?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Under the title: the badge row and the tabs. */
  headerContent?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** The prototype drawer's header, scrolling body and footer, laid out to fill `AdminStationDrawer`. */
export function AdminStationDrawerLayout({
  eyebrow,
  title,
  onClose,
  closeLabel = '關閉',
  headerContent,
  footer,
  children,
}: AdminStationDrawerLayoutProps) {
  return (
    <>
      <Box
        sx={{
          flexShrink: 0,
          p: '20px 24px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {eyebrow ? (
              <Typography
                sx={{
                  ...typography.data[300],
                  color: color.fg.neutral.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {eyebrow}
              </Typography>
            ) : null}
            <Typography
              component="h2"
              sx={{
                ...typography.heading[700],
                fontSize: 21,
                color: color.fg.neutral.default,
                mt: eyebrow ? '3px' : 0,
                overflowWrap: 'anywhere',
              }}
            >
              {title}
            </Typography>
          </Box>
          <ButtonBase
            aria-label={closeLabel}
            onClick={onClose}
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: `${radius.full}px`,
              bgcolor: color.bg.neutral.subtle,
              color: color.fg.neutral.subtle,
              '&:hover': { bgcolor: color.bg.neutral.sunken },
            }}
          >
            <X size={20} />
          </ButtonBase>
        </Box>
        {headerContent}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: '24px' }}>
        {children}
      </Box>

      {footer ? (
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            p: '16px 24px calc(16px + env(safe-area-inset-bottom))',
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          {footer}
        </Box>
      ) : null}
    </>
  );
}

export interface AdminStationDrawerTab<T extends string> {
  value: T;
  label: string;
}

/** The design system's underline tabs (`components/navigation/Tabs.jsx`). */
export function AdminStationDrawerTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: readonly AdminStationDrawerTab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <Box
      role="tablist"
      aria-label={ariaLabel}
      sx={{
        display: 'flex',
        gap: '4px',
        mt: '14px',
        borderBottom: `1px solid ${color.border.default}`,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <ButtonBase
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            sx={{
              position: 'relative',
              p: '10px 14px',
              ...typography.label[400],
              color: active ? color.fg.neutral.default : color.fg.neutral.muted,
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: -1,
                height: 3,
                borderRadius: `${radius.full}px`,
                bgcolor: active ? color.bg.primary.default : 'transparent',
              },
            }}
          >
            {tab.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/** A footer or header caption: the prototype's `wg-caption`. */
export function AdminStationDrawerCaption({
  children,
  flex,
}: {
  children: ReactNode;
  flex?: number;
}) {
  return (
    <Typography
      component="div"
      sx={{ ...typography.body[300], color: color.fg.neutral.muted, flex }}
    >
      {children}
    </Typography>
  );
}
