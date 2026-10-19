'use client';

import { Box } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

const { color, typography } = designTokens;

/**
 * The backend metric name behind a card or a chart, e.g. `y=total_tickets`. Only rendered while the
 * filter card's 顯示欄位名 is on — it is for whoever is wiring the page to the API, not for a
 * commander reading the numbers.
 *
 * Always sits next to the Chinese wording, never on its own: the design review's complaint was a
 * field name with nothing else on the card, not the field name itself.
 */
export function FieldTag({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Box
      component="code"
      title={title}
      sx={{
        ...typography.data[300],
        // `fg.neutral.subtle`, not the design's `muted`: on `bg.neutral.sunken` the muted token only
        // reaches 4.23:1, which design-tokens.ts rules out for this surface.
        color: color.fg.neutral.subtle,
        bgcolor: color.bg.neutral.sunken,
        padding: '1px 6px',
        // Not a token: the design's chip radius is 4, tighter than our 6px `sm`.
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}
