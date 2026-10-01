'use client';

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;

interface WithdrawRoleRequestDialogProps {
  open: boolean;
  /** Why the last try was refused, already in the applicant's words. */
  error: string | null;
  submitting: boolean;
  /** Nothing left to confirm: the application was decided, or withdrawn elsewhere, meanwhile. */
  settled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * One look before an application waiting for review is taken back (spec Q10): it cannot be undone,
 * and sending it again means filling the form in again. Same shape as the site's other
 * confirmations (`NeedClaimDialog`).
 */
export function WithdrawRoleRequestDialog({
  open,
  error,
  submitting,
  settled,
  onCancel,
  onConfirm,
}: WithdrawRoleRequestDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            m: { mobile: 2, tablet: 4 },
            width: { mobile: 'calc(100% - 32px)', tablet: 'calc(100% - 64px)' },
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          pt: 3,
          pb: 1.5,
          color: color.fg.neutral.default,
          fontSize: displayTextSize[20],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        撤回這筆申請？
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 1 }}>
        <Stack spacing={2}>
          <Typography
            sx={{
              color: color.fg.neutral.subtle,
              fontSize: displayTextSize[14],
              lineHeight: 1.6,
            }}
          >
            撤回後這筆申請會取消，要再申請得重新填寫。
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1, pb: 3, gap: 1.5 }}>
        <Button
          onClick={onCancel}
          disabled={submitting}
          variant="outlined"
          color="inherit"
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            borderColor: color.border.default,
            color: color.fg.neutral.subtle,
          }}
        >
          {settled ? '關閉' : '取消'}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={submitting || settled}
          variant="contained"
          disableElevation
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.default,
            color: color.fg.onPrimary,
            '&:hover': { bgcolor: color.bg.primary.hover },
            '&.Mui-disabled': {
              bgcolor: color.bg.disable,
              color: color.fg.disable,
            },
          }}
        >
          {submitting ? '撤回中...' : '撤回申請'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
