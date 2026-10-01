'use client';

import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import { Box, Button } from '@mui/material';

import { displayTextSize } from '@rescue-frontend/ui';

import { openHelpRequest } from './open-help-request';

/**
 * 請求協助 in the desktop top bar (prototype `SiteRequestHelpButton`, `site-shell.jsx:278-289`).
 * Shown to guests too: the drawer asks them to sign in before sending, not before starting. No
 * rescue wording or siren: most who need help need hands, not a rescue team.
 *
 * Only its icon from 768 to 899px: with 申請成為後台人員 on the left and 這一頁怎麼用 beside it,
 * the words leave the search box between them nothing to type in (spec S9).
 */
export function RequestHelpButton() {
  return (
    <Button
      variant="contained"
      size="small"
      startIcon={<HandshakeRoundedIcon sx={{ fontSize: 16 }} />}
      onClick={() => openHelpRequest()}
      aria-label="請求協助"
      title="需要有人幫忙？在這裡說明你的需求"
      sx={{
        flexShrink: 0,
        whiteSpace: 'nowrap',
        fontSize: displayTextSize[14],
        // A 40px circle when it is the icon alone; the theme's own padding and width beside words.
        minWidth: { tablet: 0, md: 64 },
        width: { tablet: 40, md: 'auto' },
        px: { tablet: 0, md: 3 },
        '& .MuiButton-startIcon': {
          mr: { tablet: 0, md: 1 },
          ml: { tablet: 0, md: '-2px' },
        },
      }}
    >
      <Box component="span" sx={{ display: { tablet: 'none', md: 'inline' } }}>
        請求協助
      </Box>
    </Button>
  );
}
