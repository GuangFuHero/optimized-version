'use client';

import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Box, InputBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { usePathname } from 'next/navigation';
import { startTransition, useEffect, useState, type ChangeEvent } from 'react';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

import { useOptionalSiteMapRouteState } from '../../map/site/use-site-map-route-state';
import { useSiteRouteState } from '../../route/use-site-route-state';

interface SiteHeaderSearchInputProps {
  compact?: boolean;
}

interface SiteHeaderSearchFieldProps {
  compact?: boolean;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

function normalizeSearchValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';

  return trimmed ? trimmed : undefined;
}

function SiteHeaderSearchField({
  compact = false,
  value,
  onChange,
}: SiteHeaderSearchFieldProps) {
  const palette = getRescueColorScheme(useTheme()).adminShell.topNavBar;

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: compact ? 'none' : 520,
        minWidth: 0,
        height: compact ? 40 : 42,
        px: compact ? 1.5 : 1.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: '999px',
        border: `1px solid ${palette.border}`,
        bgcolor: 'rgba(255, 255, 255, 0.72)',
        boxShadow: '0 10px 24px rgba(21, 28, 34, 0.06)',
      }}
    >
      <InputBase
        value={value ?? ''}
        onChange={onChange}
        placeholder="搜尋"
        inputProps={{
          'aria-label': '搜尋',
        }}
        startAdornment={
          <SearchRoundedIcon
            sx={{
              fontSize: compact ? 18 : 20,
              color: palette.brandText,
              flexShrink: 0,
              mr: 1,
            }}
          />
        }
        endAdornment={
          !!value ? (
            <Box
              component="button"
              onClick={() =>
                onChange?.({
                  target: { value: '' },
                } as ChangeEvent<HTMLInputElement>)
              }
              sx={{
                cursor: 'pointer',
                mr: -1,
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'transparent',
                border: 'none',
                p: 2,
                '&:hover': {
                  bgcolor: 'rgba(21, 28, 34, 0.04)',
                },
              }}
            >
              <Icons.close />
            </Box>
          ) : null
        }
        sx={{
          minWidth: 0,
          flex: 1,
          color: palette.brandText,
          '& .MuiInputBase-input': {
            p: 0,
            fontSize: compact ? 15 : 14,
            lineHeight: compact ? '22px' : '20px',
            fontWeight: 600,
            color: palette.brandText,
            '&::placeholder': {
              color: 'rgba(21, 28, 34, 0.56)',
              opacity: 1,
            },
          },
        }}
      />
    </Box>
  );
}

export function SiteHeaderSearchInputFallback({
  compact = false,
}: SiteHeaderSearchInputProps) {
  return <SiteHeaderSearchField compact={compact} />;
}

export function SiteHeaderSearchInput({
  compact = false,
}: SiteHeaderSearchInputProps) {
  const pathname = usePathname();
  const siteRoute = useSiteRouteState();
  const mapRoute = useOptionalSiteMapRouteState();
  const activeRoute =
    pathname.startsWith('/map') && mapRoute ? mapRoute : siteRoute;
  const { state, replace } = activeRoute;
  const [draft, setDraft] = useState(state.search ?? '');

  useEffect(() => {
    const nextValue = state.search ?? '';

    setDraft((current) => (current === nextValue ? current : nextValue));
  }, [state.search]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    const nextSearch = normalizeSearchValue(nextDraft);
    const currentSearch = normalizeSearchValue(state.search);

    setDraft(nextDraft);

    if (nextSearch === currentSearch && state.selectedMarkerId === undefined) {
      return;
    }

    startTransition(() => {
      replace({
        ...state,
        search: nextSearch,
        selectedMarkerId: undefined,
      });
    });
  };

  return (
    <SiteHeaderSearchField
      compact={compact}
      value={draft}
      onChange={handleChange}
    />
  );
}
