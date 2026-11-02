'use client';

import { Box, Stack, Typography } from '@mui/material';
import { ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button, designTokens } from '@rescue-frontend/ui';

import {
  SIGN_OUT_FAILED_MESSAGE,
  signOutHereAsync,
} from '../../auth/session/sign-out';
import { siteMapUrl } from './site-map-url';

const { color, typography } = designTokens;

export function NoBackOfficeAccess({ siteUrl }: { siteUrl?: string }) {
  const siteMap = siteMapUrl(siteUrl);

  return (
    <Stack
      sx={{
        minHeight: '100dvh',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        px: 2,
        textAlign: 'center',
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <Box
        component={ShieldOff}
        sx={{ width: 40, height: 40, color: color.fg.neutral.muted }}
      />
      <Typography
        component="h1"
        sx={{ ...typography.heading[600], color: color.fg.neutral.default }}
      >
        這個帳號還沒有管理權限
      </Typography>
      <Typography
        sx={{ ...typography.body[400], color: color.fg.neutral.subtle }}
      >
        如果你在政府單位或社福團體負責救災工作，可以回到公開地圖，按「申請管理權限」送出申請。
      </Typography>
      <Stack direction="row" sx={{ gap: '8px', mt: 1 }}>
        {siteMap && (
          <Button variant="outline" href={siteMap}>
            回到公開地圖
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            void signOutHereAsync().then((outcome) => {
              if (outcome === 'still-signed-in') {
                toast.error(SIGN_OUT_FAILED_MESSAGE);
              }
            });
          }}
        >
          登出
        </Button>
      </Stack>
    </Stack>
  );
}
