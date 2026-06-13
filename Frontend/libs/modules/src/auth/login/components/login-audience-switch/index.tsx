'use client';

import { Box, Tab, Tabs } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition } from 'react';
import { getAuthColorScheme } from '../../theme/auth-theme';

type LoginAudience = 'site' | 'admin';

const DEFAULT_LOGIN_AUDIENCE: LoginAudience = 'site';

const loginAudienceOptions = [
  { value: 'site', label: '前台' },
  { value: 'admin', label: '後台' },
] as const satisfies readonly {
  value: LoginAudience;
  label: string;
}[];

interface LoginAudienceSwitchProps {
  disabled?: boolean;
}

function resolveLoginAudience(value: string | null): LoginAudience {
  return value === 'admin' ? 'admin' : DEFAULT_LOGIN_AUDIENCE;
}

export function LoginAudienceSwitch({
  disabled = false,
}: LoginAudienceSwitchProps) {
  const router = useRouter();
  const authPalette = getAuthColorScheme(useTheme());

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const audience = resolveLoginAudience(searchParams.get('audience'));

  function handleAudienceChange(nextAudience: LoginAudience) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextAudience === DEFAULT_LOGIN_AUDIENCE) {
      nextSearchParams.delete('audience');
    } else {
      nextSearchParams.set('audience', nextAudience);
    }

    const nextQuery = nextSearchParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  return (
    <Box
      sx={{
        p: 0.5,
        borderRadius: '20px',
        border: `1px solid ${authPalette.fieldBorder}`,
        bgcolor: authPalette.fieldBackground,
      }}
    >
      <Tabs
        value={audience}
        onChange={(_event, nextAudience: LoginAudience) => {
          if (!nextAudience || disabled || nextAudience === audience) {
            return;
          }

          handleAudienceChange?.(nextAudience);
        }}
        variant="fullWidth"
        aria-label="登入入口切換"
        sx={{
          minHeight: 0,
          '& .MuiTabs-indicator': {
            display: 'none',
          },
        }}
      >
        {loginAudienceOptions.map((option) => (
          <Tab
            key={option.value}
            disableRipple
            value={option.value}
            label={option.label}
            disabled={disabled || !handleAudienceChange}
            sx={{
              minHeight: 36,
              borderRadius: '14px',
              textTransform: 'none',
              fontSize: 13,
              lineHeight: '16px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: authPalette.textSecondary,
              transition:
                'background-color 180ms ease, color 180ms ease, box-shadow 180ms ease',
              '&.Mui-selected': {
                color: authPalette.textPrimary,
                bgcolor: 'common.white',
                boxShadow: '0 1px 2px rgba(18, 24, 36, 0.08)',
              },
            }}
          />
        ))}
      </Tabs>
    </Box>
  );
}
