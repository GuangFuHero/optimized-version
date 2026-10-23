'use client';

import {
  Box,
  Dialog as MuiDialog,
  IconButton,
  Stack,
  Typography,
  type BoxProps,
} from '@mui/material';
import { X } from 'lucide-react';
import { useId, type FormEventHandler, type ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, shadow, typography } = designTokens;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  height?: number;
  contentSx?: BoxProps['sx'];
  dismissible?: boolean;
  onSubmit?: FormEventHandler;
  onExited?: () => void;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 920,
  height,
  contentSx = [],
  dismissible = true,
  onSubmit,
  onExited,
}: ModalProps) {
  const id = useId();

  return (
    <MuiDialog
      open={open}
      onClose={dismissible ? onClose : undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      maxWidth={false}
      slotProps={{
        transition: { onExited },
        paper: {
          component: onSubmit ? 'form' : 'div',
          onSubmit,
          sx: {
            m: { mobile: 2, tablet: 3 },
            width: `min(${width}px, calc(100% - 32px))`,
            maxWidth: 'calc(100% - 32px)',
            height,
            maxHeight: {
              mobile: 'calc(100dvh - 32px)',
              tablet: 'calc(100dvh - 48px)',
            },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: `${radius.lg}px`,
            background: color.bg.neutral.default,
            color: color.fg.neutral.default,
            border: 'none',
            backdropFilter: 'none',
            boxShadow: shadow.lg,
          },
        },
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1.5,
          p: '16px 24px',
          flexShrink: 0,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h2"
            id={`${id}-title`}
            sx={{ ...typography.heading[600], fontSize: 19 }}
          >
            {title}
          </Typography>
          {description ? (
            <Typography
              component="div"
              id={`${id}-description`}
              sx={{
                ...typography.body[300],
                color: color.fg.neutral.muted,
                mt: '3px',
              }}
            >
              {description}
            </Typography>
          ) : null}
        </Box>
        {dismissible ? (
          <IconButton
            aria-label="關閉"
            onClick={onClose}
            sx={{
              width: 34,
              height: 34,
              bgcolor: color.bg.neutral.subtle,
              color: color.fg.neutral.subtle,
            }}
          >
            <X size={19} />
          </IconButton>
        ) : null}
      </Stack>
      <Box
        sx={[
          { flex: 1, minHeight: 0, overflowY: 'auto', p: 3 },
          ...(Array.isArray(contentSx) ? contentSx : [contentSx]),
        ]}
      >
        {children}
      </Box>
      {footer ? (
        <Stack
          direction="row"
          sx={{
            p: '14px 24px',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            flexShrink: 0,
            bgcolor: color.bg.neutral.subtle,
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          {footer}
        </Stack>
      ) : null}
    </MuiDialog>
  );
}
