'use client';

import { Box, Stack, Typography } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

const { color, radius } = designTokens;

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
