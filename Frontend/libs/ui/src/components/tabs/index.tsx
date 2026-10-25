'use client';

import { Tabs as MuiTabs, type TabsProps } from '@mui/material';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export type { TabsProps } from '@mui/material';

export function Tabs({ sx, ...props }: TabsProps) {
  return (
    <MuiTabs
      {...props}
      sx={[
        {
          minHeight: 0,
          boxShadow: `inset 0 -1px 0 ${color.border.default}`,
          '& .MuiTabs-list': { gap: '4px' },
          '& .MuiTab-root': {
            minWidth: 0,
            minHeight: 0,
            px: '14px',
            py: '10px',
            ...typography.label[400],
            textTransform: 'none',
            color: color.fg.neutral.muted,
            opacity: 1,
            '&.Mui-selected': { color: color.fg.neutral.default },
          },
          '& .MuiTabs-indicator': {
            height: 3,
            display: 'flex',
            justifyContent: 'center',
            bgcolor: 'transparent',
            '&::after': {
              content: '""',
              width: 'calc(100% - 16px)',
              borderRadius: `${radius.full}px`,
              bgcolor: color.bg.primary.default,
            },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
