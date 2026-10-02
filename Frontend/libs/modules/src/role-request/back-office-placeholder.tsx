'use client';

// A client component: its 回到地圖 hands `Link` to MUI's Button, and a server layout renders it.
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import { Button, Stack, Typography } from '@mui/material';
import Link from 'next/link';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

/**
 * The back office until it is rebuilt — the old `/admin` pages are to be replaced wholesale, so none
 * of them is shown meanwhile: where 前往後台 leads. It says so and offers
 * the way back. Laid out like the briefing placeholder (`ticket/needs/briefing.tsx`).
 */
export function BackOfficePlaceholder() {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <AdminPanelSettingsRoundedIcon
        sx={{ fontSize: 28, color: color.brand.secondary.subtle }}
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
        後台
      </Typography>
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[15],
          lineHeight: 1.7,
        }}
      >
        後台正在準備中。開放後，這顆按鈕會直接帶你進去。
      </Typography>
      <Button component={Link} href="/map" variant="outlined" sx={{ mt: 1 }}>
        回到地圖
      </Button>
    </Stack>
  );
}
