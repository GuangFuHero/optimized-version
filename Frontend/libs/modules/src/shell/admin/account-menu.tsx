'use client';

import { ChevronDown, LogOut, ArrowLeftRight } from 'lucide-react';

import { Box, ButtonBase, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useCurrentUser } from '@rescue-frontend/data-access/admin';

import { Avatar, Badge, designTokens } from '@rescue-frontend/ui';
import { ROLE_DISPLAY_NAMES } from '../../auth/role-labels';

const { color, radius, shadow, typography, motion } = designTokens;

export function AccountMenu() {
  const { data: user } = useCurrentUser();
  const { data: session } = useSession();
  const name = user?.name ?? session?.user?.name ?? '';
  const identity = user?.active_identity;
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
        <Avatar name={name} src={session?.user?.image ?? undefined} size={36} />
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
            {name}
            {identity?.role ? (
              <Badge tone="primary">
                {ROLE_DISPLAY_NAMES.get(identity.role) ?? identity.role}
              </Badge>
            ) : null}
          </Box>
          {identity?.team ? (
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
              {identity.team}
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
            void signOut({ callbackUrl: '/login?callbackUrl=/' });
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
