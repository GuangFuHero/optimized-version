'use client';

import { Box, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SiteDetailLabel } from '../../shell/site/detail-info';
import type { NeedsProgress } from './need-claim';
import { NeedProgressBar } from './need-parts';

const { color, typography } = designTokens;

/**
 * The whole ticket's 志工媒合, above its needs (prototype `VolunteerProgress`). In the primary
 * colour even once full, as the prototype draws it: a need's own row turns green.
 */
export function VolunteerProgress({ progress }: { progress: NeedsProgress }) {
  const { matched, required, needCount } = progress;

  return (
    <Box>
      <Stack
        direction="row"
        sx={{
          mb: '6px',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <SiteDetailLabel sx={{ mb: 0 }}>
          志工媒合{needCount > 1 ? ` · 共 ${needCount} 筆需求` : ''}
        </SiteDetailLabel>
        <Typography
          sx={{
            fontFamily: typography.data[300].fontFamily,
            fontSize: displayTextSize[12],
            fontWeight: 700,
            lineHeight: 1.2,
            color: color.brand.primary.subtle,
          }}
        >
          {matched}/{required}
        </Typography>
      </Stack>
      <NeedProgressBar fraction={matched / required} full={false} height={8} />
    </Box>
  );
}
