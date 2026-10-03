'use client';

import { ChevronDown, LogOut, ArrowLeftRight } from 'lucide-react';

import { Box, ButtonBase, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';

import { Avatar, Badge, designTokens } from '@rescue-frontend/ui';

const { color, radius, shadow, typography, motion } = designTokens;

export interface AdminUser {
  name: string;
  image?: string;
  roleLabel?: string;
  identityLabel?: string;
}

export function AccountMenu({
  user,
  onSignOut,
}: {
  user: AdminUser;
  onSignOut?: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <ButtonBase
        disableRipple
        aria-label="帳號選單"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          gap: '10px',
          p: '5px 9px 5px 5px',
          borderRadius: `${radius.full}px`,
          bgcolor: open ? color.bg.neutral.subtle : 'transparent',
          textAlign: 'left',
          transition: `background-color ${motion.transition.fast}`,
          '&:hover': { bgcolor: color.bg.neutral.subtle },
        }}
      >
        <Avatar name={user.name} src={user.image} size={36} />
        <Box sx={{ lineHeight: 1.25 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              ...typography.label[400],
              color: color.fg.neutral.default,
            }}
          >
            {user.name}
            {user.roleLabel ? (
              <Badge tone="primary">{user.roleLabel}</Badge>
            ) : null}
          </Box>
          {user.identityLabel ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                ...typography.data[300],
                color: color.fg.neutral.muted,
              }}
            >
              <Box component={ArrowLeftRight} sx={{ width: 12, height: 12 }} />
              {user.identityLabel}
            </Box>
          ) : null}
        </Box>
        <Box
          component={ChevronDown}
          sx={{
            width: 16,
            height: 16,
            color: color.fg.neutral.muted,
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: '8px',
              minWidth: 208,
              p: '6px',
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              boxShadow: shadow.lg,
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            onSignOut?.();
          }}
          sx={{
            gap: '10px',
            height: 38,
            borderRadius: `${radius.sm}px`,
            ...typography.label[400],
            color: color.fg.neutral.default,
          }}
        >
          <Box component={LogOut} sx={{ width: 17, height: 17 }} />
          登出
        </MenuItem>
      </Menu>
    </>
  );
}
