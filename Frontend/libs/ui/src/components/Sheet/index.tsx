'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  Box,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, shadow, typography } = designTokens;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  headerContent?: ReactNode;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  actions,
  headerContent,
  footer,
  width = 440,
  children,
}: SheetProps) {
  const theme = useTheme();
  const bottom = useMediaQuery(theme.breakpoints.down('tablet'));
  const px = bottom ? '16px' : '24px';

  return (
    <Drawer
      anchor={bottom ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-label': typeof title === 'string' ? title : undefined,
          sx: {
            display: 'flex',
            flexDirection: 'column',
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
            ...(bottom
              ? {
                  width: '100%',
                  maxHeight: '92dvh',
                  borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
                }
              : { width: `min(${width}px, 100vw)`, height: '100%' }),
          },
        },
      }}
    >
      {bottom ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: '8px' }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: `${radius.full}px`,
              bgcolor: color.border.default,
            }}
          />
        </Box>
      ) : null}

      <Box
        sx={{
          flexShrink: 0,
          p: bottom ? '12px 16px 16px' : '20px 24px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: '12px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {eyebrow ? (
              <Typography
                sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
              >
                {eyebrow}
              </Typography>
            ) : null}
            <Typography
              component="h2"
              sx={{
                ...typography.heading[600],
                color: color.fg.neutral.default,
                mt: eyebrow ? '3px' : 0,
              }}
            >
              {title}
            </Typography>
            {subtitle ? (
              <Typography
                sx={{
                  ...typography.body[300],
                  color: color.fg.neutral.subtle,
                  mt: '4px',
                }}
              >
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {actions}
          <IconButton
            aria-label="關閉"
            onClick={onClose}
            sx={{ mt: '-4px', mr: '-8px', color: color.fg.neutral.subtle }}
          >
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>
        {headerContent ? <Box sx={{ mt: '12px' }}>{headerContent}</Box> : null}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: px }}>
        {children}
      </Box>

      {footer ? (
        <Stack
          direction="row"
          sx={{
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            p: bottom
              ? '12px 16px calc(12px + env(safe-area-inset-bottom))'
              : '16px 24px',
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          {footer}
        </Stack>
      ) : null}
    </Drawer>
  );
}
