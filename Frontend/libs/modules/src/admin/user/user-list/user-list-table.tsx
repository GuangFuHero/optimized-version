'use client';

import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import {
  ButtonBase,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';

import { UserStatusBadge, useUserListPalette } from './user-list-primitives';
import type { UserListRow, UserRoleId, UserRoleOption } from './types';

interface UserListTableProps {
  rows: readonly UserListRow[];
  roleOptions: readonly UserRoleOption[];
  onRoleChange: (userId: string, role: UserRoleId) => void;
}

const columns = [
  { key: 'name', label: '使用者', width: '260px' },
  { key: 'organization', label: '單位', width: '180px' },
  { key: 'role', label: '角色', width: '220px' },
  { key: 'status', label: '狀態', width: '110px' },
  { key: 'lastActiveAt', label: '最後活動', width: '140px' },
  { key: 'review', label: '審核', width: '160px' },
  { key: 'actions', label: '', width: '48px' },
] as const;

function UserText({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string;
}) {
  const palette = useUserListPalette();

  return (
    <>
      <Typography
        sx={{
          color: palette.heading,
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {primary}
      </Typography>
      {secondary ? (
        <Typography
          sx={{
            color: palette.bodyText,
            fontSize: 12,
            lineHeight: '16px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {secondary}
        </Typography>
      ) : null}
    </>
  );
}

function RoleSelect({
  userId,
  value,
  options,
  onRoleChange,
}: {
  userId: string;
  value: UserRoleId;
  options: readonly UserRoleOption[];
  onRoleChange: (userId: string, role: UserRoleId) => void;
}) {
  const palette = useUserListPalette();

  const handleChange = (event: SelectChangeEvent<UserRoleId>) => {
    onRoleChange(userId, event.target.value as UserRoleId);
  };

  return (
    <Select<UserRoleId>
      value={value}
      size="small"
      onChange={handleChange}
      IconComponent={KeyboardArrowDownRoundedIcon}
      inputProps={{ 'aria-label': '變更使用者角色' }}
      sx={{
        width: '100%',
        maxWidth: 180,
        height: 32,
        bgcolor: palette.roleSurface,
        borderRadius: 1,
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: palette.border,
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: palette.border,
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: palette.noticeAccent,
          borderWidth: 1,
        },
        '& .MuiSelect-select': {
          px: 1.25,
          py: '5px',
          fontSize: 14,
          lineHeight: '20px',
          color: palette.roleText,
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  );
}

export function UserListTable({
  rows,
  roleOptions,
  onRoleChange,
}: UserListTableProps) {
  const palette = useUserListPalette();

  return (
    <TableContainer
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        bgcolor: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 2,
        boxShadow: palette.shadow,
      }}
    >
      <Table sx={{ minWidth: 1120, tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow sx={{ bgcolor: palette.headerSurface }}>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                sx={{
                  width: column.width,
                  px: 2,
                  py: 1.5,
                  borderBottom: `1px solid ${palette.border}`,
                }}
              >
                <Typography
                  sx={{
                    color: palette.bodyText,
                    fontSize: 12,
                    lineHeight: '16px',
                    fontWeight: 700,
                    letterSpacing: '0.6px',
                  }}
                >
                  {column.label}
                </Typography>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              sx={{
                bgcolor: row.pendingReview
                  ? palette.rowHighlight
                  : palette.surface,
                '& td': { borderBottom: `1px solid ${palette.border}` },
              }}
            >
              <TableCell sx={{ px: 2, py: 1.75 }}>
                <UserText primary={row.name} secondary={row.email} />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.75 }}>
                <UserText primary={row.organization} />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.75 }}>
                <RoleSelect
                  userId={row.id}
                  value={row.role}
                  options={roleOptions}
                  onRoleChange={onRoleChange}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.75 }}>
                <UserStatusBadge status={row.status} />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.75 }}>
                <UserText primary={row.lastActiveAt} />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.75 }}>
                {row.pendingReview ? (
                  <ButtonBase
                    disableRipple
                    aria-label={`${row.name} 審核角色變更`}
                    sx={{
                      height: 28,
                      px: 1.25,
                      borderRadius: '999px',
                      bgcolor: palette.actionSurface,
                      color: palette.actionText,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 800 }}
                    >
                      審核
                    </Typography>
                  </ButtonBase>
                ) : (
                  <UserText primary="-" />
                )}
              </TableCell>
              <TableCell sx={{ px: 1, py: 1.75 }}>
                <ButtonBase
                  disableRipple
                  aria-label={`${row.name} 操作`}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '999px',
                    color: palette.bodyText,
                  }}
                >
                  <MoreHorizRoundedIcon sx={{ fontSize: 18 }} />
                </ButtonBase>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
