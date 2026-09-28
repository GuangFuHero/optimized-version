'use client';

import { useState } from 'react';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
  Badge,
  Box,
  ButtonBase,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { getRescueColorScheme } from '@rescue-frontend/ui';

import {
  countActiveStationFilters,
  parseStationFilterSearchParams,
  removeStationFilterSearchParams,
  setStationFilterSearchParams,
  stationFilterGroups,
  type StationFilterKey,
} from '../../../station/admin/station-list/station-filters';

const FilterIcon = TuneRoundedIcon;
const CheckIcon = CheckRoundedIcon;
const CloseIcon = CloseRoundedIcon;

type StationListPalette = ReturnType<
  typeof getRescueColorScheme
>['stationList'];

function createHref(pathname: string, searchParams: URLSearchParams) {
  const nextQuery = searchParams.toString();

  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function FilterOptionButton({
  label,
  selected,
  onClick,
  stationListPalette,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  stationListPalette: StationListPalette;
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
        border: `1px solid ${selected ? stationListPalette.limitedText : stationListPalette.border}`,
        bgcolor: selected
          ? stationListPalette.surface
          : stationListPalette.canvas,
        color: selected
          ? stationListPalette.limitedText
          : stationListPalette.heading,
        transition: 'background-color 120ms ease, border-color 120ms ease',
        '&:hover': {
          bgcolor: selected
            ? stationListPalette.surface
            : stationListPalette.actionHover,
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

export function MobileStationFilterBottomSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/stations';
  const searchParams = useSearchParams();
  const rescueColorScheme = getRescueColorScheme(useTheme());
  const topNavBarPalette = rescueColorScheme.adminShell.topNavBar;
  const stationListPalette = rescueColorScheme.stationList;
  const activeFilters = parseStationFilterSearchParams(searchParams);
  const activeFilterCount = countActiveStationFilters(activeFilters);

  const updateUrl = (key: StationFilterKey, value?: string) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    const nextFilters = { ...activeFilters, [key]: value };

    if (!value) {
      delete nextFilters[key];
    }

    removeStationFilterSearchParams(nextSearchParams);
    setStationFilterSearchParams(nextSearchParams, nextFilters);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  const clearFilters = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    removeStationFilterSearchParams(nextSearchParams);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  return (
    <>
      <ButtonBase
        disableRipple
        aria-label={
          activeFilterCount
            ? `開啟站點篩選，已套用 ${activeFilterCount} 個條件`
            : '開啟站點篩選'
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
            maxHeight: 'min(70dvh, 520px)',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            bgcolor: stationListPalette.canvas,
            overflow: 'hidden',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'min(70dvh, 520px)',
            bgcolor: stationListPalette.canvas,
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 4,
              borderRadius: '999px',
              bgcolor: stationListPalette.border,
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
              borderBottom: `1px solid ${stationListPalette.border}`,
            }}
          >
            <Typography
              sx={{
                color: stationListPalette.heading,
                fontSize: 18,
                lineHeight: '24px',
                fontWeight: 700,
              }}
            >
              篩選站點
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
                    ? stationListPalette.bodyText
                    : stationListPalette.mutedText,
                  '&:hover': {
                    bgcolor: activeFilterCount
                      ? stationListPalette.actionHover
                      : 'transparent',
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
                aria-label="關閉站點篩選"
                onClick={() => setOpen(false)}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '999px',
                  color: stationListPalette.heading,
                  '&:hover': { bgcolor: stationListPalette.actionHover },
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
            {stationFilterGroups.map((group) => {
              const selectedValue = activeFilters[group.key];

              return (
                <Stack key={group.key} spacing={1} sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      color: stationListPalette.bodyText,
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
                      label="全部站點"
                      selected={!selectedValue}
                      onClick={() => updateUrl(group.key)}
                      stationListPalette={stationListPalette}
                    />
                    {group.options.map((option) => (
                      <FilterOptionButton
                        key={option.value}
                        label={option.label}
                        selected={selectedValue === option.value}
                        onClick={() => updateUrl(group.key, option.value)}
                        stationListPalette={stationListPalette}
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
