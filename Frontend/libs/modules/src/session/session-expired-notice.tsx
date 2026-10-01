'use client';

import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Box, ButtonBase, Portal, Snackbar, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { designTokens, displayTextSize, RowAction } from '@rescue-frontend/ui';

import { LAYOUT_DIMENSIONS } from '../shell/layout';
import { sessionStorageOrNull } from './end-expired-session';
import { reloginHref, takeSessionExpired } from './expiry';

const { color, radius, shadow } = designTokens;

// Clear of the top bar, so the search and the account menu stay usable while it is up.
const GAP_BELOW_TOP_BAR = 12;

/**
 * Why the person is suddenly a guest, on the first page after `endExpiredSession`'s reload
 * (`note/session-expiry-spec.md` Q6, Q11): at the top, under the top bar, until closed — a toast
 * that leaves by itself would leave them guessing. Looks as `SiteToast` does; kept apart from it,
 * which sits at the foot and times out.
 */
export function SessionExpiredNotice() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // In an effect: sessionStorage exists only in the browser, and reading it while rendering would
  // differ from the server's markup.
  useEffect(() => {
    if (takeSessionExpired(sessionStorageOrNull())) {
      setOpen(true);
    }
  }, []);

  const signInAgain = () => {
    setOpen(false);
    router.push(reloginHref(window.location));
  };

  return (
    // Up in <body>, level with the drawers, as `SiteToast` is.
    <Portal>
      <Snackbar
        open={open}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{
          top: {
            mobile: `${LAYOUT_DIMENSIONS.mobileTopNavBarHeight + GAP_BELOW_TOP_BAR}px`,
            tablet: `${LAYOUT_DIMENSIONS.desktopTopNavBarHeight + GAP_BELOW_TOP_BAR}px`,
          },
        }}
      >
        <Box
          role="alert"
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
          <WarningAmberRoundedIcon
            sx={{ fontSize: 20, mt: '1px', color: color.fg.warning }}
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
              你的登入狀態已失效，請重新登入。
            </Typography>
            <RowAction
              onClick={signInAgain}
              label={
                <>
                  重新登入
                  <ChevronRightRoundedIcon sx={{ fontSize: 14 }} />
                </>
              }
              sx={{ mt: 1.5, minHeight: 44 }}
            />
          </Box>
          <ButtonBase
            aria-label="關閉"
            onClick={() => setOpen(false)}
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
