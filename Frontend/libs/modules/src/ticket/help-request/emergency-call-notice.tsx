'use client';

import { Alert } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { iconSize } = designTokens;

/**
 * Small: whoever reaches the site already knows to call 119, so it says what the platform is for
 * instead of leading the form. Shown to a guest asked to sign in, and under the need that picked
 * someone trapped or hurt, in a new request and in 「再加一件需要的幫忙」 alike.
 */
export function EmergencyCallNotice() {
  return (
    <Alert
      severity="error"
      sx={{
        py: 0.25,
        fontSize: displayTextSize[12],
        lineHeight: 1.5,
        '& .MuiAlert-icon': { py: 0.5, fontSize: iconSize.md },
      }}
    >
      緊急醫療需求請即時撥打 <strong>119</strong>{' '}
      或當地醫院電話，平台為災害時期透明資訊、尋求志工用。
    </Alert>
  );
}
