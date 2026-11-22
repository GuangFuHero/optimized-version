'use client';

// The server layout renders this client component so the shared Button can use Link.
import { Stack, Typography } from '@mui/material';
import Link from 'next/link';

import {
  Button,
  designTokens,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

const { color } = designTokens;

/**
 * The back office until it is rebuilt — the old `/admin` pages are to be replaced wholesale, so none
 * of them is shown meanwhile: where 前往管理平台 leads. It says so and offers
 * the way back.
 */
export function BackOfficePlaceholder() {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <Icons.shieldUser
        sx={{
          fontSize: designTokens.iconSize[28],
          color: color.brand.secondary.subtle,
        }}
      />
      <Typography
        component="h1"
        sx={{
          color: color.fg.neutral.default,
          fontSize: displayTextSize[20],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        管理平台
      </Typography>
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[15],
          lineHeight: 1.7,
        }}
      >
        管理平台正在準備中。開放後，這顆按鈕會直接帶你進去。
      </Typography>
      <Button component={Link} href="/map" variant="outline" sx={{ mt: 1 }}>
        回到地圖
      </Button>
    </Stack>
  );
}
