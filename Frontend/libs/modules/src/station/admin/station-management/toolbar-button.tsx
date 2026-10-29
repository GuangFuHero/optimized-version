'use client';

import { ButtonBase } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import type { ComponentProps } from 'react';

const { color, radius, typography } = designTokens;

/** The toolbar's outlined secondary actions (篩選, 審查, 匯入, 匯出): quieter than the brand outline. */
export function ToolbarButton({
  sx,
  ...rest
}: ComponentProps<typeof ButtonBase>) {
  return (
    <ButtonBase
      {...rest}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: 42,
          px: '14px',
          borderRadius: `${radius.md}px`,
          border: `1px solid ${color.border.default}`,
          bgcolor: color.bg.neutral.default,
          ...typography.label[300],
          color: color.fg.neutral.default,
          whiteSpace: 'nowrap',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
