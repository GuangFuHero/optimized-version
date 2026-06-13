'use client';

import { useState, type ReactNode } from 'react';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import PriorityHighRoundedIcon from '@mui/icons-material/PriorityHighRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { UserListIconSlot, useUserListPalette } from './user-list-primitives';
import { UserListTable } from './user-list-table';
import type { UserListRow, UserRoleId, UserRoleOption } from './types';

const roleOptions: readonly UserRoleOption[] = [
  { id: 'admin', label: '系統管理員' },
  { id: 'agency', label: '政府單位' },
  { id: 'ngo', label: '非政府組織' },
  { id: 'volunteer', label: '志工' },
] as const;

const initialRows: readonly UserListRow[] = [
  {
    id: 'u-001',
    name: '王雅雯',
    email: 'alice.wang@rescue.gov',
    organization: '中央災害應變中心',
    role: 'admin',
    status: 'active',
    lastActiveAt: '14:36',
  },
  {
    id: 'u-002',
    name: '陳志明',
    email: 'bob.chen@city.gov',
    organization: '北橋市政府',
    role: 'agency',
    status: 'pending',
    lastActiveAt: '13:52',
    pendingReview: true,
  },
  {
    id: 'u-003',
    name: '林子安',
    email: 'lin@fieldaid.org',
    organization: 'FieldAid NGO',
    role: 'ngo',
    status: 'active',
    lastActiveAt: '12:20',
  },
  {
    id: 'u-004',
    name: '張立文',
    email: 'liwen.chang@volunteer.net',
    organization: '志工調度隊',
    role: 'volunteer',
    status: 'active',
    lastActiveAt: '昨日 18:04',
  },
  {
    id: 'u-005',
    name: 'Miguel Santos',
    email: 'miguel.santos@relief.org',
    organization: 'Relief Ops',
    role: 'ngo',
    status: 'suspended',
    lastActiveAt: '5月27日',
  },
] as const;

function HeaderButton({
  icon,
  label,
  filled,
}: {
  icon: ReactNode;
  label: string;
  filled?: boolean;
}) {
  const palette = useUserListPalette();

  return (
    <ButtonBase
      disableRipple
      aria-label={label}
      sx={{
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: filled ? 2 : '17px',
        borderRadius: '999px',
        border: `1px solid ${palette.actionSurface}`,
        bgcolor: filled ? palette.actionSurface : 'transparent',
        color: palette.actionText,
        '&:hover': {
          bgcolor: filled ? palette.actionSurfaceHover : palette.noticeSurface,
        },
      }}
    >
      <UserListIconSlot icon={icon} size={14} color="currentColor" />
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 700,
          letterSpacing: '0.6px',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

function ReviewNotice() {
  const palette = useUserListPalette();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        bgcolor: palette.noticeSurface,
        border: `1px solid ${palette.actionSurface}`,
        borderRadius: 2,
      }}
    >
      <UserListIconSlot
        icon={<PriorityHighRoundedIcon />}
        size={18}
        color={palette.noticeAccent}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            color: palette.actionText,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 800,
          }}
        >
          權限升級申請
        </Typography>
        <Typography
          sx={{ color: palette.bodyText, fontSize: 13, lineHeight: '18px' }}
        >
          目前有 2 筆待審核的角色變更。
        </Typography>
      </Box>
      <HeaderButton label="全部審核" icon={<ManageAccountsRoundedIcon />} />
    </Box>
  );
}

export function UserListPage() {
  const palette = useUserListPalette();
  const [rows, setRows] = useState(initialRows);

  const handleRoleChange = (userId: string, role: UserRoleId) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === userId ? { ...row, role, pendingReview: true } : row,
      ),
    );
  };

  return (
    <Box
      component="section"
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        px: { mobile: 2, tablet: 3 },
        py: 3,
        bgcolor: palette.shellBackground,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          px: 2,
          py: 2,
          bgcolor: palette.surface,
          border: `1px solid ${palette.border}`,
          borderRadius: 2,
          boxShadow: palette.shadow,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <ManageAccountsRoundedIcon sx={{ color: palette.heading }} />
          <Typography
            sx={{
              color: palette.heading,
              fontSize: { mobile: 24, tablet: 28 },
              lineHeight: { mobile: '32px', tablet: '36px' },
              fontWeight: 800,
            }}
          >
            用戶管理
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <HeaderButton icon={<FileUploadRoundedIcon />} label="匯出" />
          <HeaderButton icon={<AddRoundedIcon />} label="新增用戶" filled />
        </Stack>
      </Box>

      <ReviewNotice />
      <UserListTable
        rows={rows}
        roleOptions={roleOptions}
        onRoleChange={handleRoleChange}
      />
    </Box>
  );
}
