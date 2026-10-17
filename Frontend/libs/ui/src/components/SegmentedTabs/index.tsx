'use client';

import { Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, shadow, typography } = designTokens;

export interface SegmentedTabsProps<T extends string> {
  items: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  panelId: string;
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  panelId,
}: SegmentedTabsProps<T>) {
  return (
    <Tabs
      aria-label={label}
      value={value}
      onChange={(_, value: T) => {
        const item = items.find((item) => item.value === value);
        if (item) onChange(item.value);
      }}
      sx={{
        minHeight: 36,
        p: '3px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.sunken,
        '& .MuiTabs-indicator': { display: 'none' },
        '& .MuiTabs-list': { gap: '2px' },
      }}
    >
      {items.map((item) => (
        <Tab
          key={item.value}
          id={`${panelId}-${item.value}`}
          aria-controls={panelId}
          value={item.value}
          label={item.label}
          disableRipple
          sx={{
            minHeight: 30,
            minWidth: 0,
            px: '14px',
            py: 0,
            borderRadius: `${radius.sm}px`,
            textTransform: 'none',
            ...typography.label[400],
            color: color.fg.neutral.muted,
            '&.Mui-selected': {
              bgcolor: color.bg.neutral.default,
              boxShadow: shadow.sm,
              color: color.fg.neutral.default,
              fontWeight: 700,
            },
            '&.Mui-focusVisible': {
              outline: `2px solid ${color.brand.secondary.default}`,
              outlineOffset: -2,
            },
          }}
        />
      ))}
    </Tabs>
  );
}
