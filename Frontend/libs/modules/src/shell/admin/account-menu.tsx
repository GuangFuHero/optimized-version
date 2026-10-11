'use client';

import { ArrowLeftRight, Check, ChevronDown, LogOut, User } from 'lucide-react';

import {
  Box,
  ButtonBase,
  Divider,
  ListSubheader,
  Menu,
  MenuItem,
} from '@mui/material';
import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import {
  useCurrentUser,
  useSwitchIdentity,
} from '@rescue-frontend/data-access/admin';

import { Avatar, Badge, designTokens } from '@rescue-frontend/ui';
import { identityLabel, ROLE_DISPLAY_NAMES } from '../../constants/roles';
import { ProfileSheet } from './profile-sheet';

const { color, radius, shadow, typography, motion } = designTokens;

export function AccountMenu() {
  const { data: user } = useCurrentUser();
  const { data: session } = useSession();
  const name = user?.name ?? session?.user?.name ?? '';
  const identity = user?.active_identity;
  const identities = user?.identities ?? [];
  const switchIdentity = useSwitchIdentity();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const open = Boolean(anchorEl);
  const itemSx = {
    gap: '10px',
    borderRadius: `${radius.sm}px`,
    ...typography.label[400],
    color: color.fg.neutral.default,
  };

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
              minWidth: identities.length > 1 ? 300 : 208,
              p: '6px',
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              boxShadow: shadow.lg,
            },
          },
        }}
      >
        {identities.length > 1 && identity ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              p: '10px 10px 11px',
            }}
          >
            <Avatar
              name={identity.team ?? identityLabel(identity)}
              tone={identity.team ? 'secondary' : 'primary'}
              size={40}
            />
            <Box sx={{ minWidth: 0, lineHeight: 1.35 }}>
              <Box
                sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
              >
                目前代表
              </Box>
              <Box
                sx={{
                  ...typography.label[500],
                  color: color.fg.neutral.default,
                }}
              >
                {identityLabel(identity)}
              </Box>
            </Box>
          </Box>
        ) : null}
        {identities.length > 1 && identity ? <Divider /> : null}
        {identities.length > 1
          ? [
              {
                label: '平台身份',
                list: identities.filter((option) => !option.team),
              },
              {
                label: '團隊身份',
                list: identities.filter((option) => option.team),
              },
            ]
              .filter(({ list }) => list.length)
              .flatMap(({ label, list }) => [
                <ListSubheader
                  key={label}
                  sx={{
                    ...typography.data[300],
                    fontWeight: 700,
                    lineHeight: '28px',
                    color: color.fg.neutral.muted,
                  }}
                >
                  {label}
                </ListSubheader>,
                ...list.map((option) => {
                  const active =
                    option.role_uuid === identity?.role_uuid &&
                    option.team_uuid === identity?.team_uuid;
                  return (
                    <MenuItem
                      key={`${option.role_uuid}:${option.team_uuid}`}
                      role="menuitemradio"
                      aria-checked={active}
                      selected={active}
                      disabled={switchIdentity.isPending}
                      onClick={() => {
                        setAnchorEl(null);
                        if (active) return;
                        switchIdentity.mutate({
                          body: {
                            role_uuid: option.role_uuid,
                            team_uuid: option.team_uuid,
                          },
                        });
                      }}
                      sx={{
                        ...itemSx,
                        minHeight: 48,
                        '&.Mui-selected, &.Mui-selected:hover': {
                          bgcolor: color.bg.primary.subtle,
                        },
                      }}
                    >
                      <Avatar
                        name={option.team ?? identityLabel(option)}
                        tone={option.team ? 'secondary' : 'primary'}
                        size={34}
                      />
                      <Box sx={{ flex: 1 }}>{identityLabel(option)}</Box>
                      {active ? (
                        <Box
                          component={Check}
                          sx={{
                            width: 17,
                            height: 17,
                            color: color.bg.primary.default,
                          }}
                        />
                      ) : null}
                    </MenuItem>
                  );
                }),
              ])
              .concat(<Divider key="identities" />)
          : null}
        <MenuItem
          disabled={!user}
          onClick={() => {
            setAnchorEl(null);
            setProfileOpen(true);
          }}
          sx={{ ...itemSx, height: 38 }}
        >
          <Box component={User} sx={{ width: 17, height: 17 }} />
          個人設定
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            void signOut({ callbackUrl: '/login?callbackUrl=/' });
          }}
          sx={{ ...itemSx, height: 38 }}
        >
          <Box component={LogOut} sx={{ width: 17, height: 17 }} />
          登出
        </MenuItem>
      </Menu>

      {profileOpen && user ? (
        <ProfileSheet user={user} onClose={() => setProfileOpen(false)} />
      ) : null}
    </>
  );
}
