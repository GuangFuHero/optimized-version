'use client';

import {
  Box,
  FormControl,
  FormHelperText,
  Link,
  OutlinedInput,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { HTMLInputTypeAttribute, ReactNode } from 'react';

import { getAuthColorScheme } from '../../theme/auth-theme';

interface AuthFieldProps {
  label: string;
  labelHelperText?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  labelActionLabel?: string;
  onLabelAction?: () => void;
  errorText?: ReactNode;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  helperText?: ReactNode;
  disabled?: boolean;
  endAdornment?: ReactNode;
}

export function AuthField({
  label,
  labelHelperText,
  value,
  onChange,
  labelActionLabel,
  onLabelAction,
  errorText,
  placeholder,
  type = 'text',
  autoComplete,
  helperText,
  disabled,
  endAdornment,
}: AuthFieldProps) {
  const authPalette = getAuthColorScheme(useTheme());
  const autofillBackground = authPalette.fieldBackground;

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 0.75,
            minWidth: 0,
          }}
        >
          <Typography
            component="div"
            sx={{
              color: authPalette.textSecondary,
              fontSize: 12,
              lineHeight: '16px',
              fontWeight: 600,
              letterSpacing: '0.6px',
            }}
          >
            {label}
          </Typography>
          {labelHelperText ? (
            <Typography
              component="div"
              sx={{
                color: authPalette.textMuted,
                fontSize: 11,
                lineHeight: '16px',
                fontWeight: 500,
                letterSpacing: '0.2px',
              }}
            >
              {labelHelperText}
            </Typography>
          ) : null}
        </Box>

        {labelActionLabel ? (
          <Link
            component="button"
            type="button"
            underline="none"
            onClick={onLabelAction}
            sx={{
              color: authPalette.warmLink,
              fontSize: 10,
              lineHeight: '12px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              cursor: 'pointer',
            }}
          >
            {labelActionLabel}
          </Link>
        ) : null}
      </Box>

      <FormControl fullWidth error={Boolean(errorText)}>
        <OutlinedInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          autoComplete={autoComplete}
          disabled={disabled}
          endAdornment={endAdornment}
          notched={false}
          sx={{
            height: 40,
            borderRadius: '16px',
            bgcolor: authPalette.fieldBackground,
            color: authPalette.textPrimary,
            alignItems: 'center',
            overflow: 'hidden',
            pl: '17px',
            pr: endAdornment ? '6px' : '17px',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: authPalette.fieldBorder,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: authPalette.warmLink,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: authPalette.coolLink,
              borderWidth: 2,
            },
            '& .MuiOutlinedInput-input': {
              boxSizing: 'border-box',
              p: 0,
              minWidth: 0,
              width: '100%',
              height: '100%',
              fontSize: 16,
              lineHeight: '24px',
              color: authPalette.textPrimary,
              '&::placeholder': {
                color: authPalette.textMuted,
                opacity: 1,
              },
              '&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus':
                {
                  WebkitTextFillColor: authPalette.textPrimary,
                  caretColor: authPalette.textPrimary,
                  WebkitBoxShadow: `0 0 0 100px ${autofillBackground} inset`,
                  boxShadow: `0 0 0 100px ${autofillBackground} inset`,
                  borderRadius: 'inherit',
                  transition: 'background-color 9999s ease-out 0s',
                },
            },
            '& .MuiOutlinedInput-input.MuiInputBase-inputAdornedEnd': {
              pr: 1,
            },
            '& .MuiInputAdornment-root': {
              color: '#6B7280',
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              maxHeight: 'none',
              m: 0,
              mr: 0.25,
            },
            '& .MuiIconButton-root': {
              p: '6px',
              m: 0,
            },
          }}
        />

        {(errorText ?? helperText) ? (
          <FormHelperText sx={{ mx: 0, mt: 0.75 }}>
            {errorText ?? helperText}
          </FormHelperText>
        ) : null}
      </FormControl>
    </Stack>
  );
}
