'use client';

import { useCallback, useState } from 'react';
import { useMutation } from 'urql';

import { WithdrawRoleRequestDocument } from '@rescue-frontend/data-access';

import { roleRequestErrorMessage } from './error';

/**
 * Withdrawing the application waiting for review: asked first in a dialog, then sent.
 * `onSubmitted` reads the applications again after either outcome.
 */
export function useWithdrawRoleRequest(onSubmitted: () => void) {
  // Open is kept apart from the application being withdrawn, so the dialog can tell whether that
  // one still waits after a refusal's reload.
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [{ fetching: submitting }, withdrawRoleRequest] = useMutation(
    WithdrawRoleRequestDocument,
  );

  const request = (uuid: string) => {
    setError(null);
    setWithdrawing(uuid);
    setOpen(true);
  };

  const confirm = async () => {
    if (!withdrawing) {
      return;
    }

    setError(null);
    const result = await withdrawRoleRequest({ uuid: withdrawing });

    if (result.error) {
      setError(
        roleRequestErrorMessage(result.error, '撤回失敗，請稍後再試一次。'),
      );
    } else {
      setOpen(false);
    }

    // Either way: the drawer goes back to the form, or shows what the application became instead.
    onSubmitted();
  };

  // Stable, so the drawer's opening effect can call it.
  const reset = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  return {
    open,
    withdrawing,
    error,
    submitting,
    request,
    confirm,
    cancel: () => setOpen(false),
    reset,
  };
}
