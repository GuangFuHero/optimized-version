'use client';

import { Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

import { Icons } from '@rescue-frontend/ui';
import { getAuthColorScheme } from '../../theme/auth-theme';

type AuthProvider = 'google' | 'line' | 'custom';

interface AuthProviderButtonProps {
  provider: AuthProvider;
  label: string;
  onClick?: () => Promise<void> | void;
  disabled?: boolean;
  icon?: ReactNode;
}

export function AuthProviderButton({
  provider,
  label,
  onClick,
  disabled,
  icon,
}: AuthProviderButtonProps) {
  const authPalette = getAuthColorScheme(useTheme());

  return (
    <Button
      type="button"
      fullWidth
      onClick={onClick}
      disabled={disabled}
      startIcon={icon ?? <AuthProviderIcon provider={provider} />}
      sx={{
        justifyContent: 'center',
        gap: 1,
        minHeight: 36,
        borderRadius: '999px',
        border: `1px solid ${authPalette.fieldBorder}`,
        bgcolor: authPalette.fieldBackground,
        color: authPalette.textPrimary,
        px: '17px',
        py: '9px',
        fontSize: 12,
        lineHeight: '16px',
        fontWeight: 600,
        letterSpacing: '0.6px',
        textTransform: 'none',
        '&:hover': {
          bgcolor: '#DCE8F2',
          borderColor: '#C9AC99',
        },
      }}
    >
      {label}
    </Button>
  );
}

function AuthProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === 'line') {
    return <Icons.lineBrand sx={{ fontSize: 16 }} />;
  }

  if (provider === 'google') {
    return <Icons.googleBrand sx={{ fontSize: 16 }} />;
  }

  return null;
}
