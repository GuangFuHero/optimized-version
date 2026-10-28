'use client';

import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import { Button } from '@mui/material';

import { displayTextSize } from '@rescue-frontend/ui';

/**
 * A guest's 登入 in both top bars: the icon and the word, not the icon alone (prototype
 * `SiteUserMenu`, `site-shell.jsx:389`). The theme's secondary, blue with black text as text on blue
 * is (2026-09-17) — not the design system `Button`'s secondary, whose white text falls short of 4.5:1
 * on that blue. `compact` for the phone's bar, where the search box needs the width.
 */
export function SiteSignInButton({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="contained"
      color="secondary"
      size="small"
      startIcon={<LoginRoundedIcon sx={{ fontSize: 16 }} />}
      onClick={onClick}
      sx={{
        flexShrink: 0,
        whiteSpace: 'nowrap',
        fontSize: displayTextSize[14],
        ...(compact ? { px: '14px' } : {}),
      }}
    >
      登入
    </Button>
  );
}
