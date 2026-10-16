'use client';

import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, ButtonBase, Portal, Snackbar, Typography } from '@mui/material';

import { designTokens, displayTextSize, RowAction } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

interface SiteToastProps {
  open: boolean;
  /** Kept after `open` turns false, so the text does not blank out while the toast leaves. */
  title: string;
  description?: string;
  /** One way onward, on a line of its own. */
  action?: { label: string; onClick: () => void };
  onClose: () => void;
}

/**
 * Word that something went through (prototype `SiteToast`, `site-actions.jsx:663-726`): without
 * it, a drawer closing reads the same whether it worked or broke, and the person sends it again.
 * Six seconds, as there — long enough to read and to press the action. Looks as `NeedClaimToast`
 * does, which has its own words and link.
 */
export function SiteToast({
  open,
  title,
  description,
  action,
  onClose,
}: SiteToastProps) {
  return (
    // Up in <body>, level with the drawers portaled there; left in the page it sits under the site
    // shell's `isolation` and never shows above a drawer (see `NeedClaimToast`).
    <Portal>
      <Snackbar
        open={open}
        autoHideDuration={6000}
        // Only the timer or the close button: a tap elsewhere should not snatch it away unread.
        onClose={(_, reason) => {
          if (reason !== 'clickaway') {
            onClose();
          }
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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
          <CheckCircleRoundedIcon
            sx={{ fontSize: 20, mt: '1px', color: color.fg.success }}
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
              <RowAction
                onClick={action.onClick}
                label={
                  <>
                    {action.label}
                    <ChevronRightRoundedIcon sx={{ fontSize: 14 }} />
                  </>
                }
                sx={{ mt: 1.5, minHeight: 44 }}
              />
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
            <CloseRoundedIcon sx={{ fontSize: 16 }} />
          </ButtonBase>
        </Box>
      </Snackbar>
    </Portal>
  );
}
