'use client';

import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import { Button } from '@mui/material';

import { displayTextSize } from '@rescue-frontend/ui';

import { openHelpRequest } from './open-help-request';

/**
 * 請求協助 in the desktop top bar (prototype `SiteRequestHelpButton`, `site-shell.jsx:278-289`).
 * Shown to guests too: the drawer asks them to sign in before sending, not before starting. No
 * rescue wording or siren: most who need help need hands, not a rescue team.
 */
export function RequestHelpButton() {
  return (
    <Button
      variant="contained"
      size="small"
      startIcon={<HandshakeRoundedIcon sx={{ fontSize: 16 }} />}
      onClick={() => openHelpRequest()}
      title="需要有人幫忙？在這裡說明你的需求"
      sx={{
        flexShrink: 0,
        whiteSpace: 'nowrap',
        fontSize: displayTextSize[14],
      }}
    >
      請求協助
    </Button>
  );
}
