'use client';

import { Box, ButtonBase, Menu, MenuItem, Stack } from '@mui/material';
import { useState, type MouseEvent } from 'react';

import { designTokens, displayTextSize, Icons } from '@rescue-frontend/ui';

import { SITE_SUB_DATA_TYPE_OPTIONS } from '../constants';
import type { RescueMapDataType } from '../types';
import { SiteControlSurface } from './control-surface';

const { color, radius, shadow, spacing, typography } = designTokens;

interface SiteSubTypeFilterProps {
  dataType: RescueMapDataType;
  selected: readonly string[];
  pinned?: readonly string[];
  onToggle: (value: string) => void;
  onTogglePinned?: (value: string) => void;
  /**
   * On a phone, the icon alone: the map's one row of controls (站點／任務, 篩選, 列表, 圖層) has no
   * room for the word. While a filter is on, the whole button turns orange and the count hangs on its
   * corner, as the bell's does, instead of squeezing in beside the icon. From 768px up, as before.
   */
  iconOnlyOnPhone?: boolean;
}

/**
 * 依目前維度提供子分類多選篩選（站點類型或任務狀態）。
 *
 * Mirrors `SiteSubTypeFilter` in `Design/前台/js/site/site-controls.jsx`. The count badge next to
 * the label is load-bearing, not decoration: without it a filtered view looks like an empty
 * dataset, and someone reads "只剩這幾筆" as the situation rather than as their own filter.
 */
export function SiteSubTypeFilter({
  dataType,
  selected,
  pinned = [],
  onToggle,
  onTogglePinned,
  iconOnlyOnPhone = false,
}: SiteSubTypeFilterProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const options = SITE_SUB_DATA_TYPE_OPTIONS[dataType];
  const open = Boolean(anchorEl);
  const selectedCount = selected.length;
  const filtering = selectedCount > 0;
  // The phone-only values; from `tablet` up each falls back to the button as it always was.
  const phone = <T, U>(onPhone: T, fromTablet: U) =>
    iconOnlyOnPhone ? { mobile: onPhone, tablet: fromTablet } : fromTablet;

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
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: phone(0, '9px'),
          py: phone(0, '5px'),
          width: phone(44, 'auto'),
          height: 44,
          flexShrink: 0,
          ...(filtering
            ? { bgcolor: phone(color.bg.primary.subtle, color.bg.neutral.default) }
            : {}),
        }}
      >
        <ButtonBase
          disableRipple
          aria-label={filtering ? `篩選子分類，已選 ${selectedCount} 項` : '篩選子分類'}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={handleOpen}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            // The icon alone is 16px: the whole 44px circle is what a finger has to hit.
            width: phone('100%', 'auto'),
            height: phone('100%', 'auto'),
            gap: `${spacing[1]}px`,
            borderRadius: `${radius.full}px`,
            color: filtering
              ? phone(color.brand.primary.default, color.fg.neutral.default)
              : color.fg.neutral.default,
            fontFamily: typography.label[400].fontFamily,
            fontSize: displayTextSize[14],
            lineHeight: 1.33,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <Icons.sliders sx={{ fontSize: 16 }} />
          <Box component="span" sx={{ display: phone('none', 'inline') }}>
            篩選
          </Box>
          {filtering ? (
            <Box
              aria-hidden
              sx={{
                // On a phone it hangs on the corner, ringed in white to stand off the map.
                position: phone('absolute', 'static'),
                top: phone(-4, 'auto'),
                right: phone(-4, 'auto'),
                ml: phone(0, '2px'),
                minWidth: phone(20, 18),
                height: phone(20, 18),
                px: '5px',
                borderRadius: `${radius.full}px`,
                bgcolor: color.bg.primary.default,
                color: color.fg.onPrimary,
                boxShadow: phone(`0 0 0 2px ${color.bg.neutral.default}`, 'none'),
                fontFamily: typography.data[300].fontFamily,
                fontSize: displayTextSize[11],
                fontWeight: 700,
                lineHeight: phone('20px', '18px'),
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
              p: `${spacing[2]}px`,
              minWidth: 232,
              maxHeight: 'min(60dvh, 420px)',
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.lg}px`,
              backgroundImage: 'none',
              boxShadow: shadow.lg,
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
              role="menuitemcheckbox"
              aria-checked={checked}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: `${spacing[2]}px`,
                minHeight: 40,
                px: `${spacing[2]}px`,
                pr: '4px',
                borderRadius: `${radius.md}px`,
                color: color.fg.neutral.default,
                '&:hover': { bgcolor: color.bg.neutral.subtle },
              }}
            >
              <Stack
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: `${spacing[2]}px`,
                  minWidth: 0,
                }}
              >
                {/* A bespoke box rather than MUI's Checkbox: the design system's checked state is a
                    filled primary square with a white tick, which MUI's default renders as an
                    outlined tick in the palette's primary instead. */}
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    borderRadius: `${radius.sm}px`,
                    display: 'grid',
                    placeItems: 'center',
                    border: `1px solid ${checked ? color.bg.primary.default : color.border.default}`,
                    bgcolor: checked
                      ? color.bg.primary.default
                      : color.bg.neutral.default,
                    color: color.fg.onPrimary,
                  }}
                >
                  {checked ? <Icons.check sx={{ fontSize: 13 }} /> : null}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: typography.body[300].fontFamily,
                    fontSize: displayTextSize[14],
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {option.label}
                </Box>
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
                    borderRadius: `${radius.full}px`,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    color: pinnedOption
                      ? color.brand.primary.subtle
                      : color.fg.neutral.muted,
                    bgcolor: pinnedOption
                      ? color.bg.primary.subtle
                      : 'transparent',
                  }}
                >
                  <Icons.pushPin sx={{ fontSize: 16 }} />
                </ButtonBase>
              ) : null}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
