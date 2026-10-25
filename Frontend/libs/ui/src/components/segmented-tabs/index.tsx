'use client';

import { Tabs, type TabsProps } from '@mui/material';

import { designTokens } from '../../theme';

const { color, shadow, typography } = designTokens;

export type SegmentedTabsProps = TabsProps;

export function SegmentedTabs({ sx, ...props }: SegmentedTabsProps) {
  return (
    <Tabs
      {...props}
      sx={[
        {
          display: 'inline-flex',
          alignSelf: 'flex-start',
          minHeight: 0,
          p: '3px',
          borderRadius: '10px',
          border: `1px solid ${color.border.default}`,
          bgcolor: color.bg.neutral.sunken,
          '& .MuiTabs-list': { gap: '2px' },
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTab-root': {
            minWidth: 0,
            minHeight: 30,
            height: 30,
            px: '14px',
            py: 0,
            borderRadius: '8px',
            ...typography.label[400],
            fontWeight: 400,
            textTransform: 'none',
            whiteSpace: 'nowrap',
            color: color.fg.neutral.muted,
            opacity: 1,
            '&.Mui-selected': {
              bgcolor: color.bg.neutral.default,
              boxShadow: shadow.sm,
              fontWeight: 700,
              color: color.fg.neutral.default,
            },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
