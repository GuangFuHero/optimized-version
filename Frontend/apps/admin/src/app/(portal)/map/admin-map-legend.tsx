import { Box, Stack, Typography } from '@mui/material';

import { ADMIN_MAP_PRIORITIES } from '@rescue-frontend/modules';

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
        borderRadius: 3,
        bgcolor: '#F6FAFF',
        boxShadow: '0 4px 14px rgba(21, 28, 34, 0.1)',
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.04em',
          color: '#8A7466',
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
              boxShadow: '0 0 0 2px #fff, 0 0 0 3px rgba(15, 23, 42, 0.25)',
            }}
          />
          <Typography sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {priority.label}
          </Typography>
        </Stack>
      ))}
      <Box sx={{ height: '1px', my: 0.25, bgcolor: '#DCC1B1' }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: '4px',
            bgcolor: '#0F172A',
          }}
        />
        <Typography sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          資源站點
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 13,
            height: 13,
            borderRadius: '3px',
            background:
              'repeating-linear-gradient(135deg, #F57C00 0 3px, #fff 3px 6px)',
            border: '1px solid #F57C00',
          }}
        />
        <Typography sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          危險區
        </Typography>
      </Stack>
    </Stack>
  );
}
