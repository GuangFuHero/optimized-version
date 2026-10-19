'use client';

import { useCallback, useState } from 'react';
import { useMutation } from 'urql';

import { WithdrawRoleRequestDocument } from '@rescue-frontend/data-access';

import { roleRequestErrorMessage } from './error';

/**
 * Withdrawing the application waiting for review: asked first in the drawer itself, then sent.
 * `onSubmitted` reads the applications again after either outcome.
 */
export function useWithdrawRoleRequest(onSubmitted: () => void) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [{ fetching: submitting }, withdrawRoleRequest] = useMutation(
    WithdrawRoleRequestDocument,
  );

  const request = () => {
    setError(null);
    setConfirming(true);
  };

  const confirm = async (uuid: string) => {
    setError(null);
    const result = await withdrawRoleRequest({ uuid });

    if (result.error) {
      setError(
        roleRequestErrorMessage(result.error, '撤回失敗，請稍後再試一次。'),
      );
    } else {
      setConfirming(false);
    }

    // Either way: the drawer goes back to the form, or shows what the application became instead.
    onSubmitted();
  };

  // Stable, so the drawer's opening effect can call it.
  const reset = useCallback(() => {
    setConfirming(false);
    setError(null);
  }, []);

  return {
    confirming,
    error,
    submitting,
    request,
    confirm,
    cancel: () => setConfirming(false),
    reset,
  };
}
