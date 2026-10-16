'use client';

import { Typography } from '@mui/material';
import { useSearchParams } from 'next/navigation';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { returnHint } from '../../utils/return-hint';

const { color } = designTokens;

/**
 * Under the card of 登入, 忘記密碼 and 重設密碼: where signing in will bring the person back, when
 * a page is waiting for it. Nothing otherwise.
 */
export function AuthReturnHint() {
  const hint = returnHint(useSearchParams().get('callbackUrl'));

  if (!hint) {
    return null;
  }

  return (
    <Typography
      sx={{
        maxWidth: 440,
        mx: 'auto',
        textAlign: 'center',
        color: color.fg.neutral.muted,
        fontSize: displayTextSize[11],
        lineHeight: 1.5,
      }}
    >
      {hint}
    </Typography>
  );
}
