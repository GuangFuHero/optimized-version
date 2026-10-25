'use client';

import { X } from 'lucide-react';

import {
  Box,
  ButtonBase,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { createContext, useContext, type ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, shadow, typography } = designTokens;

/**
 * `default` is the site's sheet. `admin` is the admin prototype's drawer (`station-drawer.jsx`,
 * `wg-profile.jsx`): a larger title and a round, filled close button.
 */
export type SheetVariant = 'default' | 'admin';

interface SheetContextValue {
  bottom: boolean;
  variant: SheetVariant;
  onClose: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext(): SheetContextValue {
  const context = useContext(SheetContext);
  if (!context) throw new Error('SheetLayout must sit inside a SheetFrame');
  return context;
}

export interface SheetFrameProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  variant?: SheetVariant;
  ariaLabel?: string;
  /** One `SheetLayout`, or several swapped in place while the frame stays open. */
  children: ReactNode;
}

/**
 * The sheet's drawer alone: right-hand on a wide screen, a bottom sheet on a narrow one. A page
 * that swaps what a sheet shows — a record's details for its edit form — keeps one frame open and
 * swaps the `SheetLayout` inside, so the sheet does not slide in again.
 */
export function SheetFrame({
  open,
  onClose,
  width = 440,
  variant = 'default',
  ariaLabel,
  children,
}: SheetFrameProps) {
  const theme = useTheme();
  const bottom = useMediaQuery(theme.breakpoints.down('tablet'));

  return (
    <Drawer
      anchor={bottom ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-label': ariaLabel,
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
      <SheetContext.Provider value={{ bottom, variant, onClose }}>
        {children}
      </SheetContext.Provider>
    </Drawer>
  );
}

export interface SheetLayoutProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  headerContent?: ReactNode;
  footer?: ReactNode;
  /** The close button; the frame's `onClose` unless the content needs to guard it. */
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}

/** A sheet's header, scrolling body and footer, filling its `SheetFrame`. */
export function SheetLayout({
  title,
  subtitle,
  eyebrow,
  leading,
  actions,
  headerContent,
  footer,
  onClose,
  closeLabel = '關閉',
  children,
}: SheetLayoutProps) {
  const sheet = useSheetContext();
  const { bottom } = sheet;
  const admin = sheet.variant === 'admin';
  const close = onClose ?? sheet.onClose;
  const px = bottom ? '16px' : '24px';

  return (
    <>
      <Box
        sx={{
          flexShrink: 0,
          p: bottom ? '12px 16px 16px' : '20px 24px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: '12px' }}>
          {leading}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {eyebrow ? (
              <Typography
                sx={{
                  ...typography.data[300],
                  color: color.fg.neutral.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {eyebrow}
              </Typography>
            ) : null}
            <Typography
              component="h2"
              sx={{
                ...(admin
                  ? { ...typography.heading[700], fontSize: 21 }
                  : typography.heading[600]),
                color: color.fg.neutral.default,
                mt: eyebrow ? '3px' : 0,
                overflowWrap: 'anywhere',
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
          {admin ? (
            <ButtonBase
              aria-label={closeLabel}
              onClick={close}
              sx={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: `${radius.full}px`,
                bgcolor: color.bg.neutral.subtle,
                color: color.fg.neutral.subtle,
                '&:hover': { bgcolor: color.bg.neutral.sunken },
              }}
            >
              <X size={20} />
            </ButtonBase>
          ) : (
            <IconButton
              aria-label={closeLabel}
              onClick={close}
              sx={{ mt: '-4px', mr: '-8px', color: color.fg.neutral.subtle }}
            >
              <Box component={X} sx={{ width: 20, height: 20 }} />
            </IconButton>
          )}
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
    </>
  );
}

export interface SheetProps
  extends Omit<SheetLayoutProps, 'onClose'>,
    Omit<SheetFrameProps, 'children' | 'ariaLabel'> {}

/** A sheet that shows one thing: a `SheetFrame` around one `SheetLayout`. */
export function Sheet({
  open,
  onClose,
  width,
  variant,
  children,
  ...layout
}: SheetProps) {
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      width={width}
      variant={variant}
      ariaLabel={typeof layout.title === 'string' ? layout.title : undefined}
    >
      <SheetLayout {...layout}>{children}</SheetLayout>
    </SheetFrame>
  );
}
