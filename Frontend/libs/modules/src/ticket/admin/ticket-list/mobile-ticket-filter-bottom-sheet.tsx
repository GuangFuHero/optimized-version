'use client';

import { useState } from 'react';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
  Badge,
  Box,
  ButtonBase,
  Drawer,
  InputAdornment,
  OutlinedInput,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import {
  countActiveTicketFilters,
  parseTicketFilterKeywordSearchParam,
  parseTicketFilterSearchParams,
  removeTicketCategoryFilterSearchParams,
  removeTicketFilterSearchParams,
  setTicketFilterSearchParams,
  ticketFilterGroups,
  ticketFilterKeywordQueryKey,
  type TicketFilterKey,
} from '../../../ticket/admin/ticket-list/ticket-filters';

const FilterIcon = TuneRoundedIcon;
const CheckIcon = CheckRoundedIcon;
const CloseIcon = CloseRoundedIcon;
const SearchIcon = SearchRoundedIcon;

function createHref(pathname: string, searchParams: URLSearchParams) {
  const nextQuery = searchParams.toString();

  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function FilterOptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      disableRipple
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        minWidth: 0,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        borderRadius: '999px',
        border: selected ? '1px solid #954900' : '1px solid #DCC1B1',
        bgcolor: selected ? '#E7EFF7' : '#FFFFFF',
        color: selected ? '#954900' : '#151C22',
        transition: 'background-color 120ms ease, border-color 120ms ease',
        '&:hover': {
          bgcolor: selected ? '#E7EFF7' : '#F6FAFF',
        },
      }}
    >
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: selected ? 700 : 500,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      {selected ? <CheckIcon sx={{ width: 16, height: 16 }} /> : null}
    </ButtonBase>
  );
}

export function MobileTicketFilterBottomSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/tickets';
  const searchParams = useSearchParams();
  const topNavBarPalette =
    getRescueColorScheme(useTheme()).adminShell.topNavBar;
  const activeFilters = parseTicketFilterSearchParams(searchParams);
  const keyword = parseTicketFilterKeywordSearchParam(searchParams);
  const activeFilterCount = countActiveTicketFilters(activeFilters, keyword);

  const updateUrl = (key: TicketFilterKey, value?: string) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    const nextFilters = { ...activeFilters, [key]: value };

    if (!value) {
      delete nextFilters[key];
    }

    removeTicketCategoryFilterSearchParams(nextSearchParams);
    setTicketFilterSearchParams(nextSearchParams, nextFilters);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  const updateKeyword = (value: string) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    const nextKeyword = value.trim();

    if (nextKeyword) {
      nextSearchParams.set(ticketFilterKeywordQueryKey, nextKeyword);
    } else {
      nextSearchParams.delete(ticketFilterKeywordQueryKey);
    }

    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  const clearFilters = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    removeTicketFilterSearchParams(nextSearchParams);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  return (
    <>
      <ButtonBase
        disableRipple
        aria-label={
          activeFilterCount
            ? `開啟任務篩選，已套用 ${activeFilterCount} 個條件`
            : '開啟任務篩選'
        }
        aria-pressed={open}
        onClick={() => setOpen(true)}
        sx={{
          width: 40,
          height: 40,
          borderRadius: '12px',
          color: topNavBarPalette.brandText,
          bgcolor: activeFilterCount
            ? topNavBarPalette.avatarHover
            : 'transparent',
          '&:hover': {
            bgcolor: topNavBarPalette.avatarHover,
          },
        }}
      >
        <Badge
          badgeContent={activeFilterCount}
          color="error"
          invisible={!activeFilterCount}
          max={9}
          sx={{
            '& .MuiBadge-badge': {
              top: 1,
              right: 1,
              minWidth: 16,
              height: 16,
              px: '4px',
              fontSize: 10,
              lineHeight: '16px',
              fontWeight: 700,
            },
          }}
        >
          <FilterIcon sx={{ width: 20, height: 20 }} />
        </Badge>
      </ButtonBase>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { mobile: 'block', tablet: 'none' },
          '& .MuiDrawer-paper': {
            maxHeight: 'min(82dvh, 640px)',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            bgcolor: '#FFFFFF',
            overflow: 'hidden',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'min(82dvh, 640px)',
            bgcolor: '#FFFFFF',
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 4,
              borderRadius: '999px',
              bgcolor: 'rgba(86, 67, 55, 0.24)',
              mx: 'auto',
              mt: 1.25,
              mb: 1,
              flexShrink: 0,
            }}
          />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              px: 2,
              pb: 1.5,
              borderBottom: '1px solid #DCC1B1',
            }}
          >
            <Typography
              sx={{
                color: '#151C22',
                fontSize: 18,
                lineHeight: '24px',
                fontWeight: 700,
              }}
            >
              篩選任務
            </Typography>

            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <ButtonBase
                disableRipple
                onClick={clearFilters}
                disabled={!activeFilterCount}
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: '999px',
                  color: activeFilterCount
                    ? '#564337'
                    : 'rgba(86, 67, 55, 0.36)',
                  '&:hover': {
                    bgcolor: activeFilterCount ? '#F6FAFF' : 'transparent',
                  },
                }}
              >
                <Typography
                  sx={{
                    color: 'inherit',
                    fontSize: 13,
                    lineHeight: '16px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  清除
                </Typography>
              </ButtonBase>

              <ButtonBase
                disableRipple
                aria-label="關閉任務篩選"
                onClick={() => setOpen(false)}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '999px',
                  color: '#151C22',
                  '&:hover': { bgcolor: '#F6FAFF' },
                }}
              >
                <CloseIcon sx={{ width: 20, height: 20 }} />
              </ButtonBase>
            </Stack>
          </Box>

          <Stack
            spacing={2.25}
            sx={{
              minHeight: 0,
              overflowY: 'auto',
              px: 2,
              py: 2,
              pb: 'max(24px, env(safe-area-inset-bottom))',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <OutlinedInput
                fullWidth
                value={keyword}
                onChange={(event) => updateKeyword(event.target.value)}
                placeholder="輸入任務、編號、地址"
                inputProps={{ 'aria-label': '搜尋任務、編號或地址' }}
                startAdornment={
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{ width: 18, height: 18, color: '#564337' }}
                    />
                  </InputAdornment>
                }
                sx={{
                  height: 44,
                  borderRadius: '999px',
                  bgcolor: '#F6FAFF',
                  color: '#151C22',
                  fontSize: 14,
                  lineHeight: '20px',
                  '& .MuiOutlinedInput-input': {
                    py: 0,
                    '&::placeholder': {
                      color: '#564337',
                      opacity: 0.72,
                    },
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#DCC1B1',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#954900',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#954900',
                    borderWidth: 1,
                  },
                }}
              />
            </Box>

            {ticketFilterGroups.map((group) => {
              const selectedValue = activeFilters[group.key];

              return (
                <Stack key={group.key} spacing={1} sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      color: '#564337',
                      fontSize: 12,
                      lineHeight: '16px',
                      fontWeight: 700,
                      letterSpacing: '0.6px',
                    }}
                  >
                    {group.label}
                  </Typography>

                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <FilterOptionButton
                      label="全部"
                      selected={!selectedValue}
                      onClick={() => updateUrl(group.key)}
                    />
                    {group.options.map((option) => (
                      <FilterOptionButton
                        key={option.value}
                        label={option.label}
                        selected={selectedValue === option.value}
                        onClick={() => updateUrl(group.key, option.value)}
                      />
                    ))}
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Box>
      </Drawer>
    </>
  );
}
