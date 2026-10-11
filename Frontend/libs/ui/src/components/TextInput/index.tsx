import { Box, InputBase, Stack, type InputBaseProps } from '@mui/material';
import { useId, type ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, motion, radius, typography } = designTokens;

export interface TextInputProps
  extends Omit<
    InputBaseProps,
    'error' | 'startAdornment' | 'endAdornment' | 'sx'
  > {
  label?: ReactNode;
  hint?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
}

export function TextInput({
  label,
  hint,
  helperText,
  error,
  leadingIcon,
  trailing,
  required,
  id,
  ...rest
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? helperText;

  return (
    <Stack sx={{ gap: '6px' }}>
      {label ? (
        <Stack
          component="label"
          htmlFor={inputId}
          direction="row"
          sx={{ alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}
        >
          <Box
            component="span"
            sx={{ ...typography.label[400], color: color.fg.neutral.default }}
          >
            {label}
            {required ? (
              <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
                {' *'}
              </Box>
            ) : null}
          </Box>
          {hint ? (
            <Box
              component="span"
              sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
            >
              {hint}
            </Box>
          ) : null}
        </Stack>
      ) : null}
      <InputBase
        id={inputId}
        required={required}
        error={Boolean(error)}
        aria-describedby={message ? messageId : undefined}
        startAdornment={leadingIcon}
        endAdornment={trailing}
        sx={{
          gap: '8px',
          minHeight: 48,
          px: '16px',
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          boxShadow: `inset 0 0 0 1px ${color.border.default}`,
          color: color.fg.neutral.default,
          ...typography.body[400],
          transition: `box-shadow ${motion.transition.fast}`,
          '& svg': { color: color.fg.neutral.muted, flexShrink: 0 },
          '&.Mui-focused': {
            boxShadow: `inset 0 0 0 1.5px ${color.brand.secondary.default}`,
          },
          '&.Mui-error': {
            boxShadow: `inset 0 0 0 1.5px ${color.bg.danger.default}`,
          },
          '&.Mui-disabled': { bgcolor: color.bg.disable },
          '& .MuiInputBase-input': { p: 0 },
        }}
        {...rest}
      />
      {message ? (
        <Box
          id={messageId}
          sx={{
            ...typography.body[300],
            color: error ? color.fg.danger : color.fg.neutral.muted,
          }}
        >
          {message}
        </Box>
      ) : null}
    </Stack>
  );
}
