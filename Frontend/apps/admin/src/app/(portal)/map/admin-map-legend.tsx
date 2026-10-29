import { Box, Stack, Typography } from '@mui/material';

import { ADMIN_MAP_PRIORITIES } from '@rescue-frontend/modules';

import { AreaSwatch } from './area-swatch';
import { designTokens } from '@rescue-frontend/ui';

const { color, radius, shadow, typography } = designTokens;

/**
 * What the colours and shapes on 互助地圖 mean: a ticket's priority, a resource station, and the
 * stripes of a 危險區, the only stripes on the map (prototype, 2026-09-25).
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
        優先級
      </Typography>
      {ADMIN_MAP_PRIORITIES.map((priority) => (
        <Stack
          key={priority.value}
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center' }}
        >
          <Box
            sx={{
              width: 11,
              height: 11,
              mx: '1px',
              borderRadius: '50%',
              bgcolor: priority.color,
              boxShadow: `0 0 0 2px ${color.bg.neutral.default}, 0 0 0 3px ${color.border.default}`,
            }}
          />
          <Typography sx={{ ...typography.label[300], whiteSpace: 'nowrap' }}>
            {priority.label}
          </Typography>
        </Stack>
      ))}
      <Box sx={{ height: '1px', my: 0.25, bgcolor: color.border.default }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: '4px',
            bgcolor: color.fg.neutral.default,
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
