'use client';

import { Button, Stack } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { AuthIdentityType } from '../../utils/identity-validation';

const { color, primitives, radius } = designTokens;

const OPTIONS: ReadonlyArray<{ value: AuthIdentityType; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: '手機號碼' },
];

interface AuthIdentityToggleProps {
  value: AuthIdentityType;
  onChange: (value: AuthIdentityType) => void;
  disabled?: boolean;
}

/** Email or phone, as every sign-in card asks it (design `site-auth.jsx` `IdentityToggle`). */
export function AuthIdentityToggle({
  value,
  onChange,
  disabled,
}: AuthIdentityToggleProps) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        p: 0.5,
        borderRadius: `${radius.lg}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.sunken,
      }}
    >
      {OPTIONS.map((option) => {
        const active = value === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            fullWidth
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            sx={{
              minHeight: 40,
              borderRadius: `${radius.md}px`,
              border: `1px solid ${active ? primitives.color.blue[300] : 'transparent'}`,
              bgcolor: active ? primitives.color.blue[100] : 'transparent',
              color: color.fg.neutral.default,
              fontSize: displayTextSize[13],
              lineHeight: 1.2,
              fontWeight: 700,
              '&:hover': {
                bgcolor: active
                  ? primitives.color.blue[100]
                  : color.bg.neutral.default,
              },
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </Stack>
  );
}
