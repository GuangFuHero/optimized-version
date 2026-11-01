'use client';

import { Typography, type SxProps, type Theme } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import type { ReactNode } from 'react';

const { color, typography } = designTokens;

/**
 * Quiet secondary text: a caption, a note, an empty value. `inline` keeps it inside a line of text;
 * `cell` is a table cell's: one line, a shade darker so it still reads beside the cell's data.
 */
export function Muted({
  children,
  inline = false,
  cell = false,
  sx,
}: {
  children: ReactNode;
  inline?: boolean;
  cell?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      component={inline ? 'span' : 'p'}
      noWrap={cell}
      sx={[
        {
          ...typography.body[300],
          color: cell ? color.fg.neutral.subtle : color.fg.neutral.muted,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}
