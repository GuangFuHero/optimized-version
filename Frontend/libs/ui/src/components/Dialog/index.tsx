'use client';

import { Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { Button } from '../Button';
import { Callout } from '../Callout';
import { Modal } from '../Modal';

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
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={444}
      dismissible={!submitting}
      onExited={onExited}
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm();
      }}
      footer={
        <>
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
        </>
      }
    >
      <Stack spacing={2}>
        {children}
        {error ? <Callout tone="danger">{error}</Callout> : null}
      </Stack>
    </Modal>
  );
}
