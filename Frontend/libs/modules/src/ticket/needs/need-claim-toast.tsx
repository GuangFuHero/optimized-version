'use client';

import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, ButtonBase, Snackbar, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

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
 * The prototype's two ways onward, 看行前資訊 and 查看我的任務, need the briefing page and the
 * my-tasks drawer, which do not exist yet; they join this toast when those do (Q30).
 */
export function NeedClaimToast({ open, needName, onClose }: NeedClaimToastProps) {
  return (
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
          {/* Q13's words, until the briefing page exists to point at. */}
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
  );
}
