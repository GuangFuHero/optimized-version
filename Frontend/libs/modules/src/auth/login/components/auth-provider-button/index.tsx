'use client';

import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

import {
  designTokens,
  Button,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';
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
      variant="neutral"
      type="button"
      fullWidth
      onClick={onClick}
      disabled={disabled}
      startIcon={icon ?? <AuthProviderIcon provider={provider} />}
      sx={{
        justifyContent: 'center',
        gap: 1,
        minHeight: 36,
        height: 'auto',
        border: `1px solid ${authPalette.fieldBorder}`,
        bgcolor: authPalette.fieldBackground,
        color: authPalette.textPrimary,
        px: '17px',
        py: '9px',
        fontSize: displayTextSize[12],
        lineHeight: 1.3,
        fontWeight: 600,
        letterSpacing: '0.6px',
        textTransform: 'none',
        '&:hover': {
          bgcolor: designTokens.color.bg.authProviderHover,
          borderColor: designTokens.color.border.authProviderHover,
        },
      }}
    >
      {label}
    </Button>
  );
}

function AuthProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === 'line') {
    return (
      <Icons.lineBrand
        sx={{
          fontSize: designTokens.iconSize[16],
        }}
      />
    );
  }

  if (provider === 'google') {
    return (
      <Icons.googleBrand
        sx={{
          fontSize: designTokens.iconSize[16],
        }}
      />
    );
  }

  return null;
}
