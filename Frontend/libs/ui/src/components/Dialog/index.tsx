'use client';

import {
  Alert,
  Button,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material';
import type { FormEvent, ReactNode } from 'react';

import { designTokens, displayTextSize } from '../../theme';

const { color, radius, shadow } = designTokens;

const CONFIRM_TONES = {
  primary: {
    bg: color.bg.primary.default,
    hover: color.bg.primary.hover,
    fg: color.fg.onPrimary,
  },
  danger: {
    bg: color.bg.danger.default,
    hover: color.bg.danger.hover,
    fg: color.fg.onDanger,
  },
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  confirmLabel: ReactNode;
  confirmIcon?: ReactNode;
  confirmTone?: keyof typeof CONFIRM_TONES;
  confirmDisabled?: boolean;
  cancelLabel?: ReactNode;
  error?: ReactNode;
  submitting?: boolean;
  onExited?: () => void;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  confirmIcon,
  confirmTone = 'primary',
  confirmDisabled = false,
  cancelLabel = '取消',
  error,
  submitting = false,
  onExited,
  children,
}: DialogProps) {
  const tone = CONFIRM_TONES[confirmTone];

  return (
    <MuiDialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        transition: { onExited },
        paper: {
          component: 'form',
          onSubmit: (event: FormEvent) => {
            event.preventDefault();
            onConfirm();
          },
          sx: {
            // MUI's 32px side margins leave each button ~130px on a 390px phone.
            m: { mobile: 2, tablet: 4 },
            width: { mobile: 'calc(100% - 32px)', tablet: 'calc(100% - 64px)' },
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          pt: 3,
          pb: 1.5,
          color: color.fg.neutral.default,
          fontSize: displayTextSize[20],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        {title}
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 1 }}>
        <Stack spacing={2}>
          {children}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1, pb: 3, gap: 1.5 }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          variant="outlined"
          color="inherit"
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            borderColor: color.border.default,
            color: color.fg.neutral.subtle,
          }}
        >
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          disabled={submitting || confirmDisabled}
          variant="contained"
          disableElevation
          startIcon={confirmIcon}
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            bgcolor: tone.bg,
            color: tone.fg,
            '&:hover': { bgcolor: tone.hover },
            '&.Mui-disabled': {
              bgcolor: color.bg.disable,
              color: color.fg.disable,
            },
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </MuiDialog>
  );
}
