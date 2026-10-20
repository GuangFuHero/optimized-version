'use client';

import {
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material';
import type { FormEvent, ReactNode } from 'react';

import { designTokens, displayTextSize } from '../../theme';
import { Button } from '../Button';
import { Callout } from '../Callout';

const { color, radius, shadow } = designTokens;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  confirmLabel: ReactNode;
  confirmIcon?: ReactNode;
  confirmTone?: 'primary' | 'danger';
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
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1, pb: 3, gap: 1.5 }}>
        <Button
          variant="outline"
          onClick={onClose}
          disabled={submitting}
          sx={{ flex: 1 }}
        >
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          variant={confirmTone}
          disabled={submitting || confirmDisabled}
          startIcon={confirmIcon}
          sx={{ flex: 1 }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </MuiDialog>
  );
}
