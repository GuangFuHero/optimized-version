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
import { toast } from 'sonner';
import {
  useCurrentUser,
  useSwitchIdentity,
  useTeams,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

import { Avatar, Badge, designTokens } from '@rescue-frontend/ui';
import {
  backOfficeIdentities,
  identityLabel,
  ROLE_DESCRIPTIONS,
  ROLE_DISPLAY_NAMES,
  TEAM_TYPE_DISPLAY_NAMES,
} from '../../constants/roles';
import {
  SIGN_OUT_FAILED_MESSAGE,
  signOutHereAsync,
} from '../../auth/session/sign-out';
import { useAuthSession } from '../../session/auth-session';
import { ProfileSheet } from './profile-sheet';

const { color, radius, shadow, typography, motion } = designTokens;

const dividerSx = {
  '&&': { m: '6px 4px' },
  borderColor: color.bg.neutral.sunken,
};

function identityAvatarName(identity: components['schemas']['IdentityOption']) {
  return (
    identity.team ?? ROLE_DISPLAY_NAMES.get(identity.role) ?? identity.role
  );
}

function identityTone(identity: components['schemas']['IdentityOption']) {
  if (identity.role === 'super_admin' || identity.role === 'admin')
    return 'primary';
  return identity.role === 'member' ? 'secondary' : 'neutral';
}

export function AccountMenu() {
  const { data: user } = useCurrentUser();
  const session = useAuthSession();
  const name = user?.name ?? session.user?.name ?? '';
  const identity = user?.active_identity;
  const identities = backOfficeIdentities(user?.identities ?? []);
  const switchIdentity = useSwitchIdentity();
  const canViewTeams = Boolean(
    identity?.team_uuid && user?.capabilities.includes('team.view'),
  );
  const { data: teams } = useTeams({ enabled: canViewTeams });
  const teamType = canViewTeams
    ? teams?.find((team) => team.uuid === identity?.team_uuid)?.type
    : undefined;
  const platformRole = identity?.team_uuid
    ? teamType && TEAM_TYPE_DISPLAY_NAMES.get(teamType)
    : identity && '平台身分';
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const open = Boolean(anchorEl);
  const itemSx = {
    gap: '10px',
    minHeight: 0,
    px: '10px',
    borderRadius: `${radius.sm}px`,
    ...typography.label[400],
    color: color.fg.neutral.default,
    '&:hover': { bgcolor: color.bg.neutral.subtle },
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
        <Avatar name={name} size={36} />
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
            {platformRole ? (
              <Badge tone={identity?.team_uuid ? 'secondary' : 'primary'}>
                {platformRole}
              </Badge>
            ) : null}
          </Box>
          {identity && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                ...typography.data[300],
                color: color.fg.neutral.muted,
              }}
            >
              {identities.length > 1 ? (
                <Box
                  component={ArrowLeftRight}
                  sx={{ width: 12, height: 12 }}
                />
              ) : null}
              {identityLabel(identity)}
            </Box>
          )}
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
          list: { sx: { p: 0 } },
        }}
      >
        {identities.length > 1 && identity
          ? [
              <Box
                key="current"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '11px',
                  p: '10px 10px 11px',
                }}
              >
                <Avatar
                  name={identityAvatarName(identity)}
                  tone={identityTone(identity)}
                  size={40}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      ...typography.body[300],
                      color: color.fg.neutral.muted,
                    }}
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
              </Box>,
              <Divider key="current-divider" sx={{ ...dividerSx, mt: 0 }} />,
              ...[
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
                    disableSticky
                    sx={{
                      p: '4px 10px 5px',
                      bgcolor: 'transparent',
                      ...typography.data[300],
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: color.fg.neutral.muted,
                    }}
                  >
                    {label}
                  </ListSubheader>,
                  ...list.map((option) => {
                    const active =
                      option.role_uuid === identity.role_uuid &&
                      option.team_uuid === identity.team_uuid;
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
                          gap: '11px',
                          minHeight: 48,
                          py: '6px',
                          '&.Mui-selected, &.Mui-selected:hover': {
                            bgcolor: color.bg.primary.subtle,
                          },
                        }}
                      >
                        <Avatar
                          name={identityAvatarName(option)}
                          tone={identityTone(option)}
                          size={34}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box
                            sx={
                              active
                                ? typography.label[500]
                                : typography.label[400]
                            }
                          >
                            {identityLabel(option)}
                          </Box>
                          <Box
                            sx={{
                              ...typography.data[300],
                              color: color.fg.neutral.muted,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {ROLE_DESCRIPTIONS.get(option.role)}
                          </Box>
                        </Box>
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
                ]),
              <Divider key="identities-divider" sx={dividerSx} />,
            ]
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
            void signOutHereAsync().then((outcome) => {
              if (outcome === 'still-signed-in') {
                toast.error(SIGN_OUT_FAILED_MESSAGE);
              }
            });
          }}
          sx={{ ...itemSx, height: 38 }}
        >
          <Box component={LogOut} sx={{ width: 17, height: 17 }} />
          登出
        </MenuItem>
      </Menu>

      {profileOpen && user ? (
        <ProfileSheet
          user={user}
          platformRole={platformRole}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}
    </>
  );
}
