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
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

const PersonIcon = Icons.person;

interface SiteUserMenuProps {
  userName?: string;
  userImage?: string;
  onSignOut?: () => void;
}

/**
 * 前台使用者操作按鈕：以左側 Avatar 作為觸發點，開啟登出等帳號操作。
 */
export function SiteUserMenu({
  userName,
  userImage,
  onSignOut,
}: SiteUserMenuProps) {
  const router = useRouter();
  const palette = getRescueColorScheme(useTheme()).adminShell.topNavBar;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // const handleOpenSecurity = () => {
  //   setAnchorEl(null);
  //   router.push('/account/security');
  // };

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
          transition: 'box-shadow 120ms ease',
          '&:hover': {
            boxShadow: `0 0 0 3px ${palette.avatarHover}`,
          },
        }}
      >
        <Avatar
          alt={userName ?? '使用者'}
          src={userImage}
          sx={{
            width: 32,
            height: 32,
            bgcolor: '#d7dbdf',
            color: '#2f3133',
            border: '1px solid rgba(32, 26, 24, 0.08)',
          }}
        >
          {!userImage ? <PersonIcon sx={{ fontSize: 20 }} /> : null}
        </Avatar>
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 180 } } }}
      >
        <MenuItem disabled sx={{ opacity: 1 }}>
          <Stack>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
              {userName || '指揮中心'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
              已登入
            </Typography>
          </Stack>
        </MenuItem>
        <Divider />
        {/* <MenuItem onClick={handleOpenSecurity} sx={{ gap: 1 }}>
          <PersonIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ fontSize: 14 }}>帳號安全</Typography>
        </MenuItem> */}
        <MenuItem onClick={handleSignOut} sx={{ gap: 1 }}>
          <PersonIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ fontSize: 14 }}>登出</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}
