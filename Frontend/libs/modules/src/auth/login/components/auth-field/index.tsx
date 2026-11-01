'use client';

import {
  Box,
  FormControl,
  FormHelperText,
  OutlinedInput,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { HTMLAttributes, HTMLInputTypeAttribute, ReactNode } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { getAuthColorScheme } from '../../theme/auth-theme';

const { color } = designTokens;

export interface AuthFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  errorText?: ReactNode;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  /** The keyboard a phone opens: `numeric` for a code. */
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  helperText?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  endAdornment?: ReactNode;
  /**
   * Marks the label with a red asterisk, as the design system's `TextInput` does, and says so to a
   * screen reader. `aria-required`, not `required`: a native `required` would let the browser stop a
   * form with its own message, in place of the field's.
   */
  required?: boolean;
}

export function AuthField({
  label,
  value,
  onChange,
  errorText,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  helperText,
  disabled,
  autoFocus,
  endAdornment,
  required = false,
}: AuthFieldProps) {
  const authPalette = getAuthColorScheme(useTheme());

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Typography
        component="div"
        sx={{
          color: authPalette.textSecondary,
          fontSize: displayTextSize[12],
          lineHeight: 1.3,
          fontWeight: 600,
          letterSpacing: '0.6px',
        }}
      >
        {label}
        {required ? (
          <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
            {' *'}
          </Box>
        ) : null}
      </Typography>

      <FormControl fullWidth error={Boolean(errorText)}>
        <OutlinedInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          autoComplete={autoComplete}
          inputProps={{
            inputMode,
            'aria-required': required || undefined,
          }}
          disabled={disabled}
          autoFocus={autoFocus}
          endAdornment={endAdornment}
          notched={false}
          sx={{
            // What autofill is painted over with (the theme's `MuiInputBase`).
            '--wg-field-bg': authPalette.fieldBackground,
            '--wg-field-fg': authPalette.textPrimary,
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
