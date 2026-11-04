'use client';

import { Box, ButtonBase, Portal, Snackbar, Typography } from '@mui/material';

import {
  Button,
  designTokens,
  displayTextSize,
  RowAction,
  Icons,
  safeAreaBottom,
} from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

interface SiteToastProps {
  open: boolean;
  /** Kept after `open` turns false, so the text does not blank out while the toast leaves. */
  title: string;
  description?: string;
  /** One way onward, on a line of its own. */
  action?: { label: string; onClick: () => void };
  /** Beside `action`: letting go of what the toast is about (BTN-103). */
  discardAction?: { label: string; onClick: () => void };
  /** `info` for what is only worth knowing: nothing went through, so no check mark. */
  tone?: 'success' | 'info';
  /** Stays until acted on or closed, for what takes longer than a toast lasts. */
  persistent?: boolean;
  onClose: () => void;
}

/**
 * Word that something went through (prototype `SiteToast`, `site-actions.jsx:663-726`): without
 * it, a drawer closing reads the same whether it worked or broke, and the person sends it again.
 * Six seconds, as there — long enough to read and to press the action. Looks as `NeedClaimToast`
 * does, which has its own words and link. A persistent one sits higher on a phone, clear of the
 * ticket drawer's last row: that holds 接這筆, and this one does not leave by itself.
 */
export function SiteToast({
  open,
  title,
  description,
  action,
  discardAction,
  tone = 'success',
  persistent = false,
  onClose,
}: SiteToastProps) {
  const ToneIcon = tone === 'info' ? Icons.info : Icons.circleCheck;

  return (
    // Up in <body>, level with the drawers portaled there; left in the page it sits under the site
    // shell's `isolation` and never shows above a drawer (see `NeedClaimToast`).
    <Portal>
      <Snackbar
        open={open}
        autoHideDuration={persistent ? null : 6000}
        // Only the timer or the close button: a tap elsewhere should not snatch it away unread.
        onClose={(_, reason) => {
          if (reason !== 'clickaway' && !persistent) {
            onClose();
          }
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={
          persistent
            ? { bottom: { mobile: safeAreaBottom(96), tablet: 24 } }
            : undefined
        }
      >
        <Box
          role="status"
          aria-live="polite"
          sx={{
            width: 'min(420px, calc(100vw - 32px))',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            p: 2,
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
            border: `1px solid ${color.border.default}`,
            boxShadow: shadow.lg,
          }}
        >
          <ToneIcon
            sx={{
              fontSize: 20,
              mt: '1px',
              color: tone === 'info' ? color.fg.info : color.fg.success,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                color: color.fg.neutral.default,
                fontSize: displayTextSize[14],
                lineHeight: 1.4,
                fontWeight: 700,
              }}
            >
              {title}
            </Typography>
            {description ? (
              <Typography
                sx={{
                  mt: 0.25,
                  color: color.fg.neutral.subtle,
                  fontSize: displayTextSize[13],
                  lineHeight: 1.6,
                }}
              >
                {description}
              </Typography>
            ) : null}
            {/* 44px tall and away from 關閉, so a tap meant to close does not carry the person off
                (prototype site-actions.jsx:692-715). */}
            {action ? (
              <Box
                sx={{
                  mt: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <RowAction
                  onClick={action.onClick}
                  label={
                    <>
                      {action.label}
                      <Icons.chevronRight sx={{ fontSize: 14 }} />
                    </>
                  }
                  sx={{ minHeight: 44 }}
                />
                {discardAction ? (
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="sm"
                    onClick={discardAction.onClick}
                  >
                    {discardAction.label}
                  </Button>
                ) : null}
              </Box>
            ) : null}
          </Box>
          <ButtonBase
            aria-label="關閉"
            onClick={onClose}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: `${radius.full}px`,
              color: color.fg.neutral.subtle,
            }}
          >
            <Icons.close sx={{ fontSize: 16 }} />
          </ButtonBase>
        </Box>
      </Snackbar>
    </Portal>
  );
}
