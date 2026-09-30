import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

/**
 * Where a volunteer reads, before going, how to get there, what to bring and whom to find
 * (prototype `BRIEFING_HREF`, `site-actions.jsx:1925-1941`). The claim toast (Q49) and the top of
 * 我的任務 › 我承接的 (Q10) both lead here.
 */
export const BRIEFING_HREF = '/briefing';

/**
 * The briefing page until its content is designed (Q13): it says so, and sends the volunteer to
 * the one person who knows — the contact on the ticket.
 */
export function BriefingPlaceholder() {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <MenuBookRoundedIcon
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
        行前資訊
      </Typography>
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[15],
          lineHeight: 1.7,
        }}
      >
        行前資訊準備中，出發前請先跟現場聯絡人確認。
      </Typography>
    </Stack>
  );
}
