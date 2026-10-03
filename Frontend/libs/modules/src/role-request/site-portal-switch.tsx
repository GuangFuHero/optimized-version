'use client';

import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import { ButtonBase } from '@mui/material';
import Link from 'next/link';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { BACK_OFFICE_HREF, type SitePortalEntry } from './portal-entry';

const { color, typography } = designTokens;

const PILL_SX = {
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
} as const;

const ICON_SX = { fontSize: 16, color: color.fg.neutral.muted } as const;

/**
 * The desktop top bar's back-office entry, after the 公開頁面 badge (prototype `SitePortalSwitch`,
 * topbar variant, `Design/前台/js/site/site-shell.jsx:272-296`). The two look alike but are not
 * the same element: 前往後台 crosses to another page, so it is a link and opens in a new tab;
 * 申請成為後台人員 opens the application drawer, so it is a button. On a phone the same entry sits
 * at the foot of the menu drawer instead.
 */
export function SitePortalSwitch({
  entry,
  onApply,
}: {
  entry: SitePortalEntry;
  onApply?: () => void;
}) {
  if (entry === 'backOffice') {
    return (
      <ButtonBase
        LinkComponent={Link}
        href={BACK_OFFICE_HREF}
        title="前往後台（不需再次登入）"
        sx={PILL_SX}
      >
        <SwapHorizRoundedIcon sx={ICON_SX} />
        前往後台
      </ButtonBase>
    );
  }

  if (entry === 'apply') {
    return (
      <ButtonBase onClick={onApply} title="送出成為後台人員的申請" sx={PILL_SX}>
        <VerifiedRoundedIcon sx={ICON_SX} />
        申請成為後台人員
      </ButtonBase>
    );
  }

  return null;
}
