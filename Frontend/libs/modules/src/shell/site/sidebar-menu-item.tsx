'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import { designTokens, displayTextSize, withAlpha } from '@rescue-frontend/ui';

const { color: token } = designTokens;

const sidebarMenuItemTransition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
const sidebarMenuItemHoverSurface = withAlpha(token.bg.secondary.subtle, 0.6);

type SidebarMenuItemColorVariant = 'default' | 'active';

export interface SidebarMenuItemData {
  id: string;
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  fontWeight?: number;
  path?: string;
  onClick?: () => void;
}

interface SidebarMenuItemProps {
  item: SidebarMenuItemData;
  open?: boolean;
  colorVariant?: SidebarMenuItemColorVariant;
  ariaPressed?: boolean;
  iconSize?: number;
  lineHeight?: string;
  letterSpacing?: string;
  maxLabelWidth?: number;
}

export function SidebarMenuItem({
  item,
  open = true,
  colorVariant,
  ariaPressed,
  iconSize = 15,
  lineHeight = '20px',
  letterSpacing,
  maxLabelWidth = 184,
}: SidebarMenuItemProps) {
  const sidebarPalette = getRescueColorScheme(useTheme()).adminShell.sidebar;
  const resolvedColorVariant =
    colorVariant ?? (item.selected ? 'active' : 'default');
  const active = resolvedColorVariant === 'active';
  const color = active ? sidebarPalette.activeText : sidebarPalette.bodyText;
  const actionProps = item.path
    ? { LinkComponent: Link, href: item.path }
    : { component: 'button' as const, type: 'button' as const };

  return (
    <ButtonBase
      disableRipple
      aria-label={item.label}
      aria-pressed={ariaPressed ?? item.selected}
      onClick={item.onClick}
      {...actionProps}
      sx={{
        width: '100%',
        minHeight: 32,
        gap: open ? 2 : 0,
        px: open ? 2 : 1,
        py: 1,
        borderRadius: '32px',
        justifyContent: 'flex-start',
        bgcolor: active ? token.bg.secondary.subtle : 'transparent',
        border: `1px solid ${
          active ? token.brand.secondary.default : 'transparent'
        }`,
        color,
        transition: sidebarMenuItemTransition,
        '&:hover': {
          bgcolor: active
            ? token.bg.secondary.subtle
            : sidebarMenuItemHoverSurface,
        },
      }}
    >
      {item.icon ? (
        <Box
          sx={{
            width: iconSize,
            height: iconSize,
            color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            '& > *': {
              width: '100%',
              height: '100%',
            },
            '& svg': {
              display: 'block',
              width: '100%',
              height: '100%',
            },
          }}
        >
          {item.icon}
        </Box>
      ) : null}
      <Typography
        aria-hidden={!open}
        sx={{
          opacity: open ? 1 : 0,
          maxWidth: open ? maxLabelWidth : 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          my: 0,
          color,
          // 🔴 The designer's 2026-09-11 note calls this element out by name: the sidebar label
          // rides the DS `label[400]` size, which is NOT on the display ladder, so it sat still
          // while the rest of the site grew on a phone. 18px is their stated ceiling for a row
          // this short — do not raise it further without also raising `lineHeight`.
          fontSize: displayTextSize[14],
          lineHeight,
          fontWeight: item.fontWeight ?? 400,
          letterSpacing,
          textAlign: 'left',
          transition: sidebarMenuItemTransition,
        }}
      >
        {item.label}
      </Typography>
    </ButtonBase>
  );
}
