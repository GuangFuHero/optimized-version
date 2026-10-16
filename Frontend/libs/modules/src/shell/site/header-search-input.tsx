'use client';

import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Box, InputBase } from '@mui/material';
import { usePathname } from 'next/navigation';
import { startTransition, useEffect, useState, type ChangeEvent } from 'react';

import { designTokens, Icons } from '@rescue-frontend/ui';

import { useOptionalSiteMapRouteState } from '../../map/site/use-site-map-route-state';
import { useSiteRouteState } from '../../route/use-site-route-state';

const { color, radius, typography, motion } = designTokens;

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
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.subtle,
        // Inset ring rather than a border, matching the design system's `Input`: the ring can
        // thicken on focus without the field changing size and nudging the header around it.
        boxShadow: `inset 0 0 0 1px ${color.border.default}`,
        transition: `box-shadow ${motion.transition.fast}`,
        '&:focus-within': {
          boxShadow: `inset 0 0 0 1.5px ${color.brand.secondary.default}`,
        },
      }}
    >
      <InputBase
        value={value ?? ''}
        onChange={onChange}
        placeholder="搜尋站點、任務或地點"
        inputProps={{
          'aria-label': '搜尋',
        }}
        startAdornment={
          <SearchRoundedIcon
            sx={{
              fontSize: compact ? 18 : 20,
              color: color.fg.neutral.muted,
              flexShrink: 0,
              mr: 1,
            }}
          />
        }
        endAdornment={
          value ? (
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
                  bgcolor: color.bg.neutral.sunken,
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
          color: color.fg.neutral.default,
          '& .MuiInputBase-input': {
            p: 0,
            fontFamily: typography.body[400].fontFamily,
            fontSize: compact ? 15 : 14,
            lineHeight: compact ? '22px' : '20px',
            fontWeight: 600,
            color: color.fg.neutral.default,
            '&::placeholder': {
              color: color.fg.neutral.muted,
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
