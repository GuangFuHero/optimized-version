'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { getRescueColorScheme } from '@rescue-frontend/ui';

const sidebarMenuItemTransition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
const sidebarMenuItemHoverSurface = 'rgba(119, 213, 254, 0.18)';

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
        bgcolor: active ? '#D8F2FF' : 'transparent',
        border: active ? '1px solid #8ED8F8' : '1px solid transparent',
        color,
        transition: sidebarMenuItemTransition,
        '&:hover': {
          bgcolor: active
            ? '#D8F2FF'
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
          fontSize: 14,
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
