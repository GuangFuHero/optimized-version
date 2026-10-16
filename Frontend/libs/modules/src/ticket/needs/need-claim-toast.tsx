'use client';

import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, ButtonBase, Portal, Snackbar, Typography } from '@mui/material';
import Link from 'next/link';

import { designTokens, displayTextSize, RowAction } from '@rescue-frontend/ui';

import { BRIEFING_HREF } from './briefing';

const { color, radius, shadow } = designTokens;

interface NeedClaimToastProps {
  open: boolean;
  /** Kept after `open` turns false, so the text does not blank out while the toast leaves. */
  needName: string;
  onClose: () => void;
}

/**
 * Word that the claim went through (prototype `SiteToast`, `site-actions.jsx:663-726`): without it,
 * a dialog closing reads the same whether it worked or broke. Six seconds, as there — long enough
 * to read.
 *
 * One way onward, as in the prototype: 看行前資訊, the moment a volunteer starts thinking about
 * what to bring. 我的任務 is a tap away in the account menu.
 */
export function NeedClaimToast({ open, needName, onClose }: NeedClaimToastProps) {
  return (
    // Up in <body>, level with the drawers and dialogs portaled there. Left in the page, it sat
    // under the site shell's `isolation` and its <main>'s z-index, below any of them: on a phone,
    // where the detail drawer covers the screen and most claims are made, it never showed. Added
    // after they open, it is also outside the aria-hidden they put on the rest of <body>.
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
          <CheckCircleRoundedIcon sx={{ fontSize: 20, mt: '1px', color: color.fg.success }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                color: color.fg.neutral.default,
                fontSize: displayTextSize[14],
                lineHeight: 1.4,
                fontWeight: 700,
              }}
            >
              {/* An ideographic space, as the prototype's title has it. */}
              已承接{'　'}
              {needName}
            </Typography>
            {/* What the briefing page says too (`BriefingPlaceholder`), until it has more to offer. */}
            <Typography
              sx={{
                mt: 0.25,
                color: color.fg.neutral.subtle,
                fontSize: displayTextSize[13],
                lineHeight: 1.6,
              }}
            >
              出發前請先跟現場聯絡人確認。
            </Typography>
            {/* Bordered but not filled, on a line of its own and 44px tall, away from 關閉: a tap
                meant to close must not carry the volunteer off the page they just claimed on
                (prototype site-actions.jsx:692-715). */}
            <RowAction
              LinkComponent={Link}
              href={BRIEFING_HREF}
              label={
                <>
                  看行前資訊
                  <ChevronRightRoundedIcon sx={{ fontSize: 14 }} />
                </>
              }
              sx={{ mt: 1.5, minHeight: 44 }}
            />
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
