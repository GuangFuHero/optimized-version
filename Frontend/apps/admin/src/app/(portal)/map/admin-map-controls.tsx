import { Box, Stack } from '@mui/material';
import type { ReactNode } from 'react';
import { designTokens } from '@rescue-frontend/ui';
import { AdminMapLegend } from './admin-map-legend';

const { color, radius, shadow, typography } = designTokens;

export function AdminMapControls({
  isDrawing,
  isBusy,
  children,
}: {
  isDrawing: boolean;
  isBusy: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1400,
        pointerEvents: 'none',
      }}
    >
      <Stack
        spacing={1}
        sx={{
          position: 'absolute',
          top: 12,
          left: 12,
          pointerEvents: 'auto',
          maxWidth: 'calc(100vw - 56px)',
        }}
      >
        {children}
      </Stack>
      {isDrawing ? (
        <Box
          role="note"
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100% - 24px)',
            px: 2,
            py: 1,
            borderRadius: `${radius.full}px`,
            bgcolor: color.fg.neutral.default,
            color: color.fg.inverse,
            boxShadow: shadow.md,
            ...typography.label[300],
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          點地圖加轉角 · Backspace 退回 · Enter 或雙擊完成 · Esc 取消
        </Box>
      ) : null}
      {!isBusy ? (
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            bottom: 28,
            pointerEvents: 'auto',
          }}
        >
          <AdminMapLegend />
        </Box>
      ) : null}
    </Box>
  );
}
