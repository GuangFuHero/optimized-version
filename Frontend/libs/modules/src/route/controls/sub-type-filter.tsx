'use client';

import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import {
  Box,
  ButtonBase,
  Checkbox,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import { useState, type MouseEvent } from 'react';

import { SITE_SUB_DATA_TYPE_OPTIONS } from '../constants';
import type { RescueMapDataType } from '../types';
import { SiteControlSurface } from './control-surface';

interface SiteSubTypeFilterProps {
  dataType: RescueMapDataType;
  selected: readonly string[];
  pinned?: readonly string[];
  onToggle: (value: string) => void;
  onTogglePinned?: (value: string) => void;
}

/**
 * 依目前維度提供子分類多選篩選（站點類型或任務狀態）。
 */
export function SiteSubTypeFilter({
  dataType,
  selected,
  pinned = [],
  onToggle,
  onTogglePinned,
}: SiteSubTypeFilterProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const options = SITE_SUB_DATA_TYPE_OPTIONS[dataType];
  const open = Boolean(anchorEl);
  const selectedCount = selected.length;

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <SiteControlSurface
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          px: '9px',
          py: '5px',
          height: 40,
        }}
      >
        <ButtonBase
          disableRipple
          aria-label="篩選子分類"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={handleOpen}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            borderRadius: 999,
            color: '#151c22',
          }}
        >
          <FilterListOutlinedIcon sx={{ fontSize: 18 }} />
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 700,
              lineHeight: '16px',
              whiteSpace: 'nowrap',
            }}
          >
            篩選
          </Typography>
          {selectedCount > 0 ? (
            <Box
              sx={{
                ml: 0.25,
                minWidth: 18,
                height: 18,
                px: 0.5,
                borderRadius: 999,
                bgcolor: '#954900',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: '18px',
                textAlign: 'center',
              }}
            >
              {selectedCount}
            </Box>
          ) : null}
        </ButtonBase>
      </SiteControlSurface>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              px: 1,
              minWidth: 200,
              bgcolor: '#FFFFFF',
              borderRadius: '20px',
              backgroundImage: 'none',
              boxShadow: '0 12px 30px rgba(21, 28, 34, 0.12)',
            },
          },
        }}
      >
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const pinnedOption = pinned.includes(option.value);

          return (
            <MenuItem
              key={option.value}
              onClick={() => onToggle(option.value)}
              sx={{
                gap: 1,
                px: 1,
                borderRadius: '12px',
                bgcolor: '#FFFFFF',
                '&:hover': {
                  bgcolor: '#F7F9FC',
                },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  minWidth: 0,
                  flex: 1,
                  color: '#333',
                }}
              >
                <Checkbox
                  edge="start"
                  checked={checked}
                  tabIndex={-1}
                  disableRipple
                  size="small"
                  sx={{ p: 0 }}
                />
                <Typography sx={{ fontSize: 14 }}>{option.label}</Typography>
              </Stack>
              {onTogglePinned ? (
                <ButtonBase
                  disableRipple
                  aria-label={
                    pinnedOption
                      ? `取消釘選${option.label}`
                      : `釘選${option.label}`
                  }
                  aria-pressed={pinnedOption}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onTogglePinned(option.value);
                  }}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    color: pinnedOption ? '#954900' : '#7a6b61',
                    bgcolor: pinnedOption ? '#FDE7D8' : '#FFFFFF',
                  }}
                >
                  {pinnedOption ? (
                    <PushPinRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <PushPinOutlinedIcon sx={{ fontSize: 18 }} />
                  )}
                </ButtonBase>
              ) : null}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
