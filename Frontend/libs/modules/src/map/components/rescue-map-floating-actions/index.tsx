'use client';

import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

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
        borderRadius: '32px',
        border: '1px solid #dcc1b1',
        bgcolor: 'rgba(225, 233, 241, 0.9)',
        backdropFilter: 'blur(6px)',
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
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
            color: '#564337',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '12px',
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            color: valueColor,
            fontSize: 24,
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
              color: '#564337',
              fontSize: 10,
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
              color: '#954900',
              fontSize: 12,
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
            bgcolor: '#dbe3ec',
          }}
        >
          <Box
            sx={{
              width: '64%',
              height: '100%',
              borderRadius: 999,
              bgcolor: '#954900',
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
        valueColor="#151c22"
        minWidth={140}
      />
      <VolunteerKpiCard />
      <KpiValueCard
        label="活躍站點"
        value="14"
        valueColor="#006685"
        minWidth={140}
      />
    </Stack>
  );
}
