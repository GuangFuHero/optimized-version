'use client';

import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens, displayTextSize, withAlpha } from '@rescue-frontend/ui';

const { color, radius, shadow, typography } = designTokens;

function KpiSurface({
  children,
  minWidth,
}: {
  children: ReactNode;
  minWidth: number;
}) {
  return (
    <Box
      sx={{
        minWidth,
        alignSelf: 'stretch',
        borderRadius: `${radius.xl}px`,
        border: `1px solid ${color.border.accent}`,
        // Near-opaque rather than a flat fill: these cards float over live map tiles, and the
        // design system lets a little terrain read through without letting it compete with the
        // numbers. `withAlpha` keeps the tint honest if the surface token ever changes.
        bgcolor: withAlpha(color.bg.neutral.default, 0.92),
        backdropFilter: 'blur(8px)',
        boxShadow: shadow.md,
      }}
    >
      {children}
    </Box>
  );
}

function KpiValueCard({
  label,
  value,
  valueColor,
  minWidth,
}: {
  label: string;
  value: string;
  valueColor: string;
  minWidth: number;
}) {
  return (
    <KpiSurface minWidth={minWidth}>
      <Stack spacing={0.5} sx={{ px: '17px', py: '17px' }}>
        <Typography
          sx={{
            color: color.fg.neutral.subtle,
            fontFamily: typography.label[400].fontFamily,
            fontSize: displayTextSize[10],
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: '.06em',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            color: valueColor,
            fontSize: displayTextSize[24],
            fontWeight: 700,
            lineHeight: '32px',
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </Typography>
      </Stack>
    </KpiSurface>
  );
}

function VolunteerKpiCard() {
  return (
    <KpiSurface minWidth={200}>
      <Stack spacing={1} sx={{ p: '17px' }}>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'flex-end' }}
        >
          <Typography
            sx={{
              color: color.fg.neutral.subtle,
              fontSize: displayTextSize[10],
              fontWeight: 700,
              lineHeight: '12px',
              letterSpacing: 0,
              whiteSpace: 'nowrap',
            }}
          >
            志工數量
          </Typography>
          <Typography
            sx={{
              color: color.brand.primary.subtle,
              fontSize: displayTextSize[12],
              fontWeight: 700,
              lineHeight: '16px',
              letterSpacing: 0,
              whiteSpace: 'nowrap',
            }}
          >
            320/500
          </Typography>
        </Stack>
        <Box
          sx={{
            width: '100%',
            height: 8,
            borderRadius: 999,
            bgcolor: color.bg.neutral.sunken,
          }}
        >
          <Box
            sx={{
              width: '64%',
              height: '100%',
              borderRadius: 999,
              bgcolor: color.brand.primary.subtle,
            }}
          />
        </Box>
      </Stack>
    </KpiSurface>
  );
}

export function RescueMapFloatingActions() {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        zIndex: 1200,
        pointerEvents: 'none',
        alignItems: 'stretch',
      }}
    >
      <KpiValueCard
        label="任務總數"
        value="1,240"
        valueColor={color.fg.neutral.default}
        minWidth={140}
      />
      <VolunteerKpiCard />
      <KpiValueCard
        label="活躍站點"
        value="14"
        valueColor={color.brand.secondary.subtle}
        minWidth={140}
      />
    </Stack>
  );
}
