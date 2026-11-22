// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { Button, Stack } from '@mui/material';

import { designTokens, displayTextSize } from '../../theme';

const { color, primitives, radius } = designTokens;

export interface SegmentedControlProps<Value extends string> {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  disabled?: boolean;
}

export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  disabled,
}: SegmentedControlProps<Value>) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        p: 0.5,
        borderRadius: `${radius.lg}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.sunken,
      }}
    >
      {options.map((option) => {
        const active = value === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            fullWidth
            disabled={disabled}
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            sx={{
              minHeight: 40,
              borderRadius: `${radius.md}px`,
              border: `1px solid ${active ? primitives.color.blue[300] : 'transparent'}`,
              bgcolor: active ? primitives.color.blue[100] : 'transparent',
              color: color.fg.neutral.default,
              fontSize: displayTextSize[13],
              lineHeight: 1.2,
              fontWeight: 700,
              '&:hover': {
                bgcolor: active
                  ? primitives.color.blue[100]
                  : color.bg.neutral.default,
              },
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </Stack>
  );
}
