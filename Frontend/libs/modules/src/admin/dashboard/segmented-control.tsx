'use client';

import { ButtonBase, Stack } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

const { color, typography, radius } = designTokens;

/**
 * A joined segmented control — one bordered track, the selected segment filled, a hairline between
 * neighbours. Matches the design's `Seg` (`js/admin/dashboard/db-app.jsx`): the switches in the
 * filter card and the chart headers are one control, not a row of separate pills.
 *
 * `sm` (chart headers) highlights with the sunken neutral so the fill does not compete with the
 * chart's own colour; `md` (filter card) uses the primary fill.
 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: {
  /** Names the group for assistive tech. */
  label: string;
  options: readonly { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  const small = size === 'sm';
  return (
    <Stack
      direction="row"
      role="group"
      aria-label={label}
      sx={{
        display: 'inline-flex',
        flexShrink: 0,
        maxWidth: '100%',
        '&:focus-within': {
          outline: `2px solid ${color.border.accent}`,
          outlineOffset: 2,
        },
        borderRadius: `${small ? radius.full : radius.sm}px`,
        border: `1px solid ${color.border.default}`,
        // Clips the end segments' square corners to the track's radius.
        overflow: 'hidden',
      }}
    >
      {options.map((option, index) => {
        const selected = option.id === value;
        return (
          <ButtonBase
            key={option.id}
            disableRipple
            aria-pressed={selected}
            title={option.hint}
            onClick={() => onChange(option.id)}
            sx={{
              border: 'none',
              minHeight: { mobile: 44, tablet: small ? 28 : 36 },
              minWidth: 44,
              // Only between neighbours: the track's own border closes both ends.
              borderLeft: index ? `1px solid ${color.border.default}` : 'none',
              // A wrapped "近 30 / 天" would be unreadable, so the label never breaks.
              whiteSpace: 'nowrap',
              padding: small ? '3px 10px' : '7px 13px',
              bgcolor: selected
                ? small
                  ? color.bg.neutral.sunken
                  : color.bg.primary.default
                : 'transparent',
              color: selected
                ? small
                  ? color.fg.neutral.default
                  : color.fg.onPrimary
                : color.fg.neutral.muted,
              ...(small ? typography.data[300] : typography.label[300]),
              fontWeight: selected ? 700 : 400,
              // Hover only on the segments that do something: the design gives the selected one no
              // hover, and a darker primary fill would need a contrast ruling of its own.
              '&:hover': selected
                ? undefined
                : { bgcolor: color.bg.neutral.subtle },
            }}
          >
            {option.label}
          </ButtonBase>
        );
      })}
    </Stack>
  );
}
