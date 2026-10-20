'use client';

import { ButtonBase, type ButtonBaseProps } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography, motion } = designTokens;

export interface SidebarItemProps extends Omit<ButtonBaseProps, 'children'> {
  icon: ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  href?: string;
}

export function SidebarItem({
  icon,
  label,
  active = false,
  collapsed = false,
  sx,
  ...rest
}: SidebarItemProps) {
  return (
    <ButtonBase
      disableRipple
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      sx={{
        position: 'relative',
        display: 'flex',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '12px',
        width: collapsed ? 44 : '100%',
        height: 44,
        px: collapsed ? 0 : '16px',
        borderRadius: `${radius.md}px`,
        bgcolor: active ? color.bg.primary.subtle : 'transparent',
        color: active ? color.brand.primary.subtle : color.fg.neutral.subtle,
        ...typography.label[400],
        transition: `background-color ${motion.transition.fast}, color ${motion.transition.fast}`,
        '&:hover': {
          bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.sunken,
        },
        '& .MuiSvgIcon-root, & .lucide': {
          width: 22,
          height: 22,
          fontSize: 22,
        },
        ...(active &&
          !collapsed && {
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 12,
              width: 3,
              height: 20,
              borderRadius: `${radius.full}px`,
              bgcolor: color.bg.primary.default,
            },
          }),
        ...sx,
      }}
      {...rest}
    >
      {icon}
      {collapsed ? null : <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
    </ButtonBase>
  );
}
