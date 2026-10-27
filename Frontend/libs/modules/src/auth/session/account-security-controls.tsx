'use client';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useRef, type KeyboardEvent } from 'react';

import { designTokens } from '@rescue-frontend/ui';

import type { AuthIdentityType } from '../login';

const { color, radius, shadow } = designTokens;

const CONTACT_TYPE_LABELS: ReadonlyArray<[AuthIdentityType, string]> = [
  ['email', '電子郵件'],
  ['phone', '手機號碼'],
];

const ARROW_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * 電子郵件 or 手機號碼, as a segmented choice (design A1): one grey track, the chosen half white, bold
 * and ticked. Not two buttons — a filled one reads as 「送出」 — and not a switch, which is on or off.
 * A radio group to a keyboard too: one tab stop, on the chosen half, and the arrow keys move the choice.
 */
export function ContactTypeChoice({
  value,
  disabled = false,
  onChange,
}: {
  value: AuthIdentityType;
  disabled?: boolean;
  onChange: (value: AuthIdentityType) => void;
}) {
  const halves = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEPS[event.key];

    if (!step || disabled) {
      return;
    }

    event.preventDefault();

    const count = CONTACT_TYPE_LABELS.length;
    const at = CONTACT_TYPE_LABELS.findIndex(([type]) => type === value);
    const next = (at + step + count) % count;

    onChange(CONTACT_TYPE_LABELS[next][0]);
    halves.current[next]?.focus();
  };

  return (
    <Box
      role="radiogroup"
      aria-label="要新增哪一種"
      onKeyDown={move}
      sx={{
        display: 'flex',
        gap: 0.5,
        p: 0.5,
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.sunken,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {CONTACT_TYPE_LABELS.map(([type, label], index) => {
        const on = type === value;

        return (
          <ButtonBase
            key={type}
            ref={(half: HTMLButtonElement | null) => {
              halves.current[index] = half;
            }}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(type)}
            sx={{
              flex: 1,
              gap: 0.75,
              height: 44,
              borderRadius: `${radius.full}px`,
              bgcolor: on ? color.bg.neutral.default : 'transparent',
              boxShadow: on ? shadow.sm : 'none',
              color: on ? color.fg.neutral.default : color.fg.neutral.subtle,
              fontSize: 16,
              fontWeight: on ? 700 : 500,
            }}
          >
            {on ? (
              <CheckRoundedIcon
                sx={{ fontSize: 16, color: color.brand.secondary.default }}
              />
            ) : null}
            {label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/**
 * 「第 2 步，共 3 步」 with a dot for each step (design A1): done ones blue, this one drawn out, the rest
 * grey; this step's name under it in bold.
 */
export function StepDots({
  steps,
  at,
}: {
  steps: readonly string[];
  /** This step, counted from 0. */
  at: number;
}) {
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={0.75} aria-hidden="true">
        {steps.map((step, index) => (
          <Box
            key={step}
            sx={{
              width: index === at ? 24 : 8,
              height: 8,
              borderRadius: `${radius.full}px`,
              bgcolor:
                index <= at
                  ? color.brand.secondary.default
                  : color.border.default,
            }}
          />
        ))}
      </Stack>
      <Typography sx={{ fontSize: 16, color: color.fg.neutral.subtle }}>
        第 {at + 1} 步，共 {steps.length} 步
      </Typography>
      <Typography
        sx={{ fontSize: 18, fontWeight: 700, color: color.fg.neutral.default }}
      >
        {steps[at]}
      </Typography>
    </Stack>
  );
}
