'use client';

// Temporary: delete when BE-036 is wired into 任務管理 (ADMIN-025).

import { Box, Stack, Typography } from '@mui/material';
import {
  FLOOR_STATE_LABEL,
  OpenSpaceButton,
  useSpaces,
} from '@rescue-frontend/modules';

export default function SpacePreviewPage() {
  const { spaces, isLoading, error } = useSpaces();

  return (
    <Stack sx={{ gap: 2, p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>
          開啟空間（預覽）
        </Typography>
        <OpenSpaceButton />
      </Stack>
      {isLoading ? <Typography>載入中…</Typography> : null}
      {error ? <Typography color="error">{String(error)}</Typography> : null}
      {spaces.map(({ row }) => (
        <Box
          key={row.id}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
        >
          <Typography sx={{ fontWeight: 600 }}>🏢 {row.name}</Typography>
          <Typography variant="body2">{row.address ?? '—'}</Typography>
          <Typography variant="body2">
            {row.summary} · {FLOOR_STATE_LABEL[row.status]} · 優先級{' '}
            {row.priority ?? '—'}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
