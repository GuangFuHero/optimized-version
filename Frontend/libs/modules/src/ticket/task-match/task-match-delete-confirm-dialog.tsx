'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

import type { RescueMapMarkerItem } from '../../map/types';

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
        backdrop: {
          sx: {
            backgroundColor: 'rgba(21, 28, 34, 0.28)',
          },
        },
        paper: {
          sx: {
            borderRadius: 2,
            border: '1px solid #DCC1B1',
            bgcolor: '#F6FAFF',
            boxShadow: '0 18px 48px rgba(21, 28, 34, 0.18)',
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle sx={{ px: 3, pt: 3, pb: 1.5 }}>
        <Stack spacing={0.75}>
          <Typography
            sx={{
              color: '#151C22',
              fontSize: 18,
              lineHeight: '24px',
              fontWeight: 700,
            }}
          >
            刪除任務
          </Typography>
          <Typography
            sx={{
              color: '#667085',
              fontSize: 12,
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
            color: '#344256',
            fontSize: 14,
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
            borderColor: '#D0D5DD',
            color: '#344256',
            '&:hover': {
              borderColor: '#98A2B3',
              bgcolor: '#F2F4F7',
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
            bgcolor: '#BA1A1A',
            color: '#FFFFFF',
            '&:hover': {
              bgcolor: '#9F1414',
            },
          }}
        >
          確認刪除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
