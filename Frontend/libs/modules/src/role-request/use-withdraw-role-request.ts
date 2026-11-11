'use client';

import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { WithdrawRoleRequestDocument } from '@rescue-frontend/data-access';

import { siteGraphqlMutation } from '../session/site-clients';
import { roleRequestErrorMessage } from './error';

/**
 * Withdrawing the application waiting for review: asked first in the drawer itself, then sent.
 * `onSubmitted` reads the applications again after either outcome.
 */
export function useWithdrawRoleRequest(onSubmitted: () => void) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdrawal = useMutation(
    siteGraphqlMutation(WithdrawRoleRequestDocument),
  );

  const request = () => {
    setError(null);
    setConfirming(true);
  };

  const confirm = (uuid: string) => {
    setError(null);
    withdrawal.mutate(
      { uuid },
      {
        onSuccess: () => setConfirming(false),
        onError: (failure) =>
          setError(
            roleRequestErrorMessage(failure, '撤回失敗，請稍後再試一次。'),
          ),
        // Either way: the drawer goes back to the form, or shows what the application became instead.
        onSettled: () => onSubmitted(),
      },
    );
  };

  // Stable, so the drawer's opening effect can call it.
  const reset = useCallback(() => {
    setConfirming(false);
    setError(null);
  }, []);

  return {
    confirming,
    error,
    submitting: withdrawal.isPending,
    request,
    confirm,
    cancel: () => setConfirming(false),
    reset,
  };
}
