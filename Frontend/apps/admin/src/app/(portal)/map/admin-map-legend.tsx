import { Box, Stack, Typography } from '@mui/material';

import { AreaSwatch } from './area-swatch';
import { designTokens } from '@rescue-frontend/ui';

const { color, radius, shadow, typography } = designTokens;

/**
 * What the pins on 互助地圖 are, as they are drawn: tickets and stations are told apart by colour,
 * a ticket's priority is not (the prototype colours pins by priority; whether this page should is
 * for 糖 to say), and the stripes are a 危險區's alone.
 */
export function AdminMapLegend() {
  return (
    <Stack
      spacing={0.75}
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.neutral.subtle,
        boxShadow: shadow.md,
      }}
    >
      <Typography
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          letterSpacing: '.04em',
          color: color.fg.neutral.muted,
        }}
      >
        圖例
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: color.bg.primary.default,
          }}
        />
        <Typography sx={{ ...typography.label[300], whiteSpace: 'nowrap' }}>
          任務單（圖示分緊急、處理中）
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: color.bg.info.default,
          }}
        />
        <Typography sx={{ ...typography.label[300], whiteSpace: 'nowrap' }}>
          資源站點
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <AreaSwatch kind="hazardous_zone" size={13} />
        <Typography sx={{ ...typography.label[300], whiteSpace: 'nowrap' }}>
          危險區
        </Typography>
      </Stack>
    </Stack>
  );
}
