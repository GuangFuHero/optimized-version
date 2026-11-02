'use client';

import { Box, Stack, Typography } from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { designTokens } from '@rescue-frontend/ui';

const { color, radius, typography } = designTokens;

/** A titled card, with one line on whom it affects (prototype `st-app.jsx` `Section`). */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  who,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  who: string;
  children: ReactNode;
}) {
  return (
    <Stack
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      sx={{
        gap: '16px',
        p: { mobile: '20px 16px', tablet: '24px' },
        borderRadius: `${radius.lg}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: '12px' }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.subtle,
            color: color.brand.primary.subtle,
          }}
        >
          <Icon size={18} aria-hidden />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            id={`${id}-title`}
            component="h2"
            sx={{ ...typography.heading[600], color: color.fg.neutral.default }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              ...typography.body[400],
              mt: '2px',
              color: color.fg.neutral.muted,
            }}
          >
            {who}
          </Typography>
        </Box>
      </Stack>
      {children}
    </Stack>
  );
}

/**
 * One setting: its label and what it is for on the left, the value on the right (prototype `Row`,
 * a 180px label column). A phone has no room for two columns, so it stacks.
 */
export function SettingsRow({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  /** The field the label names, when the value is one. */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          mobile: 'minmax(0, 1fr)',
          tablet: '180px minmax(0, 1fr)',
        },
        gap: { mobile: '10px', tablet: '16px' },
        alignItems: 'start',
        py: '14px',
        borderTop: `1px solid ${color.border.default}`,
      }}
    >
      <Box>
        <Typography
          component={htmlFor ? 'label' : 'p'}
          htmlFor={htmlFor}
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          {label}
        </Typography>
        {help ? (
          <Typography
            sx={{
              ...typography.body[300],
              mt: '4px',
              color: color.fg.neutral.muted,
            }}
          >
            {help}
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

/** Said under a control that waits for the name: the first save has to carry one (backend rule). */
export function NeedsNameHint() {
  return (
    <Typography
      sx={{ ...typography.body[300], mt: '6px', color: color.fg.neutral.muted }}
    >
      先填災害名稱並儲存
    </Typography>
  );
}
