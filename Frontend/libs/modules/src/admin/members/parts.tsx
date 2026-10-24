'use client';

import { Search, type LucideIcon } from 'lucide-react';

import {
  Box,
  Stack,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens, TextInput } from '@rescue-frontend/ui';

import { formatTaiwanTime } from '../../time';

const { color, radius, shadow, typography } = designTokens;

/** The prototype's `wg-caption`: 14px, muted. */
export const captionSx = {
  ...typography.body[300],
  color: color.fg.neutral.muted,
};

/**
 * The content area of the prototype's `WGShell` (`padding: 12px 28px 28px`). The admin shell's
 * `<main>` has none of its own, so each page brings it; phones keep the 16px gutter.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        p: { mobile: '12px 16px 24px', tablet: '12px 28px 28px' },
      }}
    >
      {children}
    </Box>
  );
}

/** The prototype's `Card`: the same surface `DataTable` draws its table on. */
export function Panel({
  children,
  padding = '20px',
  sx,
}: {
  children: ReactNode;
  padding?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[
        {
          p: padding,
          bgcolor: color.bg.neutral.default,
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          boxShadow: shadow.md,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** The prototype's `StatPill`: a figure about the team, not a control. */
export function StatPill({
  Icon,
  label,
  value,
  danger,
}: {
  Icon: LucideIcon;
  label: string;
  value: ReactNode;
  danger?: boolean;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 1,
        height: 36,
        px: '14px',
        borderRadius: `${radius.full}px`,
        bgcolor: danger ? color.bg.danger.subtle : color.bg.neutral.subtle,
        border: `1px solid ${color.border.default}`,
      }}
    >
      <Box
        component={Icon}
        sx={{
          width: 15,
          height: 15,
          color: danger ? color.fg.danger : color.fg.neutral.muted,
        }}
      />
      <Typography
        sx={{
          ...captionSx,
          color: color.fg.neutral.subtle,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          ...typography.data[400],
          fontWeight: 700,
          whiteSpace: 'nowrap',
          color: danger ? color.fg.danger : color.fg.neutral.default,
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Read by screen readers; the placeholder alone disappears once typing starts. */
  label: string;
}) {
  return (
    <TextInput
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      leadingIcon={<Search size={17} />}
      inputProps={{ 'aria-label': label, type: 'search' }}
    />
  );
}

/** A backend timestamp as 「9/30 14:05」 in Taiwan time; `—` for never. */
export function formatDateTime(value: string | null | undefined) {
  return formatTaiwanTime(value) ?? '—';
}
