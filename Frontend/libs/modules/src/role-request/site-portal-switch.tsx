'use client';

import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { ButtonBase } from '@mui/material';
import Link from 'next/link';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { BACK_OFFICE_HREF, type SitePortalEntry } from './portal-entry';

const { color, typography } = designTokens;

/**
 * The desktop top bar's 前往後台, after the 公開頁面 badge (prototype `SitePortalSwitch`, topbar
 * variant, `Design/前台/js/site/site-shell.jsx:288-296`). A link, not a button: it crosses to
 * another page, so opening it in a new tab works. On a phone the same entry sits at the foot of the
 * menu drawer instead. 申請成為後台人員 comes with the application drawer.
 */
export function SitePortalSwitch({ entry }: { entry: SitePortalEntry }) {
  if (entry !== 'backOffice') {
    return null;
  }

  return (
    <ButtonBase
      LinkComponent={Link}
      href={BACK_OFFICE_HREF}
      title="前往後台（不需再次登入）"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: 36,
        px: 1.5,
        flexShrink: 0,
        borderRadius: 999,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
        color: color.fg.neutral.default,
        fontFamily: typography.body[400].fontFamily,
        fontSize: displayTextSize[14],
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        '&:hover': { bgcolor: color.bg.neutral.subtle },
      }}
    >
      <SwapHorizRoundedIcon
        sx={{ fontSize: 16, color: color.fg.neutral.muted }}
      />
      前往後台
    </ButtonBase>
  );
}
