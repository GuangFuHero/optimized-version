'use client';

import type { ReactNode } from 'react';

import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import type { UserListStatus } from './types';

export function useUserListPalette() {
  return getRescueColorScheme(useTheme()).adminPanels.userManagement;
}

export function UserListIconSlot({
  icon,
  size,
  color,
}: {
  icon?: ReactNode;
  size: number;
  color: string;
}) {
  if (!icon) {
    return null;
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        '& > *': { width: '100%', height: '100%' },
        '& svg': { display: 'block', width: '100%', height: '100%' },
      }}
    >
      {icon}
    </Box>
  );
}

function getStatusLabel(status: UserListStatus) {
  switch (status) {
    case 'pending':
      return '待審核';
    case 'suspended':
      return '停用';
    default:
      return '啟用';
  }
}

export function UserStatusBadge({ status }: { status: UserListStatus }) {
  const palette = useUserListPalette();
  const pending = status === 'pending';
  const suspended = status === 'suspended';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1,
        py: '3px',
        borderRadius: '999px',
        bgcolor: suspended
          ? 'rgba(186, 26, 26, 0.08)'
          : pending
            ? palette.noticeSurface
            : 'rgba(46, 125, 50, 0.1)',
        color: suspended
          ? '#BA1A1A'
          : pending
            ? palette.noticeAccent
            : '#2E7D32',
      }}
    >
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 10,
          lineHeight: '14px',
          fontWeight: 700,
          letterSpacing: '0.8px',
          whiteSpace: 'nowrap',
        }}
      >
        {getStatusLabel(status)}
      </Typography>
    </Box>
  );
}
