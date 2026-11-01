'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  Avatar,
  ButtonBase,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import {
  designTokens,
  displayTextSize,
  Icons,
  nameInitials,
} from '@rescue-frontend/ui';

import { MyTasksDrawer } from '../../ticket/my-claims/my-tasks-drawer';

const { color, radius, shadow, spacing, motion } = designTokens;

const PersonIcon = Icons.person;

interface SiteUserMenuProps {
  userName?: string;
  onSignOut?: () => void;
}

/**
 * 前台使用者操作按鈕：以左側 Avatar 作為觸發點，開啟登出等帳號操作。
 */
export function SiteUserMenu({ userName, onSignOut }: SiteUserMenuProps) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  // The drawer rides with the menu that opens it, so no page has to host it: it is there on every
  // page the menu is, the phone's top bar included.
  const [myTasksOpen, setMyTasksOpen] = useState(false);

  const handleOpenMyTasks = () => {
    setAnchorEl(null);
    setMyTasksOpen(true);
  };

  const handleOpenSecurity = () => {
    setAnchorEl(null);
    router.push('/account/security');
  };

  const handleSignOut = () => {
    setAnchorEl(null);
    onSignOut?.();
  };

  return (
    <>
      <ButtonBase
        disableRipple
        aria-label="使用者選單"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          borderRadius: '50%',
          transition: `box-shadow ${motion.transition.fast}`,
          '&:hover': {
            boxShadow: `0 0 0 3px ${color.bg.secondary.subtle}`,
          },
        }}
      >
        <Avatar
          alt={userName ?? '使用者'}
          sx={{
            width: 32,
            height: 32,
            bgcolor: color.brand.secondary.default,
            color: color.fg.onSecondary,
            border: `1px solid ${color.border.default}`,
            // Fixed, not displayTextSize (16 on a phone): two initials have to fit on one line in
            // the 32px circle. The ui Avatar's size too (`size * 0.36`).
            fontSize: 12,
          }}
        >
          {/* No picture since the login moved to the backend (`/users/me` has none): the name's initials. */}
          {nameInitials(userName ?? '') || <PersonIcon sx={{ fontSize: 20 }} />}
        </Avatar>
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
              mt: 1,
              minWidth: 240,
              p: `${spacing[2]}px`,
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.lg}px`,
              backgroundImage: 'none',
              boxShadow: shadow.lg,
            },
          },
        }}
      >
        <MenuItem disabled sx={{ opacity: 1 }}>
          <Stack>
            <Typography sx={{ fontSize: displayTextSize[14], fontWeight: 700 }}>
              {userName || '指揮中心'}
            </Typography>
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                color: color.fg.neutral.muted,
              }}
            >
              已登入
            </Typography>
          </Stack>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleOpenMyTasks} sx={{ gap: 1 }}>
          <Icons.clipboardList sx={{ fontSize: 18 }} />
          <Typography sx={{ fontSize: displayTextSize[14] }}>
            我的任務
          </Typography>
        </MenuItem>
        {/* Not in the prototype's menu, which has no such page: added after 我的任務, the site's own
            thing, and before 登出. */}
        <MenuItem onClick={handleOpenSecurity} sx={{ gap: 1 }}>
          <Icons.shield sx={{ fontSize: 18 }} />
          <Typography sx={{ fontSize: displayTextSize[14] }}>
            帳號安全
          </Typography>
        </MenuItem>
        <MenuItem onClick={handleSignOut} sx={{ gap: 1 }}>
          <PersonIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ fontSize: displayTextSize[14] }}>登出</Typography>
        </MenuItem>
      </Menu>

      <MyTasksDrawer open={myTasksOpen} onClose={() => setMyTasksOpen(false)} />
    </>
  );
}
