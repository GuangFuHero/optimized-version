'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

import type { RescueMapMarkerItem } from '../../map/types';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

interface TaskMatchDeleteConfirmDialogProps {
  open: boolean;
  task: RescueMapMarkerItem | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TaskMatchDeleteConfirmDialog({
  open,
  task,
  onCancel,
  onConfirm,
}: TaskMatchDeleteConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            borderRadius: `${radius.lg}px`,
            border: `1px solid ${color.border.accent}`,
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle sx={{ px: 3, pt: 3, pb: 1.5 }}>
        <Stack spacing={0.75}>
          <Typography
            sx={{
              color: color.fg.neutral.default,
              fontSize: displayTextSize[18],
              lineHeight: '24px',
              fontWeight: 700,
            }}
          >
            刪除任務
          </Typography>
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[12],
              lineHeight: '16px',
              fontWeight: 600,
              letterSpacing: '0.4px',
            }}
          >
            此操作會立即從目前資料中移除
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 1 }}>
        <Typography
          sx={{
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[14],
            lineHeight: '22px',
          }}
        >
          確認要刪除「{task?.title ?? '這筆任務'}」嗎？刪除後畫面上將不再顯示這筆資料。
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1, pb: 3, gap: 1.5 }}>
        <Button
          onClick={onCancel}
          variant="outlined"
          color="inherit"
          sx={{
            minWidth: 96,
            height: 40,
            borderRadius: 1,
            borderColor: color.border.default,
            color: color.fg.neutral.subtle,
            '&:hover': {
              borderColor: color.fg.neutral.muted,
              bgcolor: color.bg.neutral.sunken,
            },
          }}
        >
          取消
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          disableElevation
          sx={{
            minWidth: 120,
            height: 40,
            borderRadius: 1,
            bgcolor: color.bg.danger.default,
            color: color.fg.onDanger,
            '&:hover': {
              bgcolor: color.bg.danger.hover,
            },
          }}
        >
          確認刪除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
