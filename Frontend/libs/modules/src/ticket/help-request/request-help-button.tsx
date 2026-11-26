// SPDX-License-Identifier: GPL-3.0-only
'use client';

import {
  designTokens,
  Button,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

import { openHelpRequest } from './open-help-request';

/**
 * 請求協助 in the desktop top bar (prototype `SiteRequestHelpButton`, `site-shell.jsx:278-289`).
 * Shown to guests too: the drawer asks them to sign in before sending, not before starting. No
 * rescue wording or siren: most who need help need hands, not a rescue team.
 *
 * Words at every width from 768px up, as the prototype: it is the site's main action, and an icon
 * alone is one a first-time visitor cannot read. The search box beside it shrinks instead.
 */
export function RequestHelpButton() {
  return (
    <Button
      variant="primary"
      size="sm"
      startIcon={
        <Icons.heartHandshake
          sx={{
            fontSize: designTokens.iconSize[16],
          }}
        />
      }
      onClick={() => openHelpRequest()}
      title="需要有人幫忙？在這裡說明你的需求"
      sx={{
        flexShrink: 0,
        minHeight: 40,
        whiteSpace: 'nowrap',
        fontSize: displayTextSize[14],
        px: 3,
        gap: 1,
        '& .MuiButton-startIcon': { ml: '-2px' },
      }}
    >
      請求協助
    </Button>
  );
}
