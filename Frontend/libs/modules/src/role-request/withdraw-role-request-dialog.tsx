'use client';

import { Typography } from '@mui/material';

import { designTokens, Dialog, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

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
 * One look before an application waiting for review is taken back: it cannot be undone,
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
      onClose={onCancel}
      onConfirm={onConfirm}
      title="撤回這筆申請？"
      confirmLabel={submitting ? '撤回中...' : '撤回申請'}
      confirmDisabled={settled}
      cancelLabel={settled ? '關閉' : '取消'}
      error={error}
      submitting={submitting}
    >
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[14],
          lineHeight: 1.6,
        }}
      >
        撤回後這筆申請會取消，要再申請得重新填寫。
      </Typography>
    </Dialog>
  );
}
