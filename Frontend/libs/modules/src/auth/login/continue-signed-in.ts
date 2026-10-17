'use client';

import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

import { broadcastAuthChange } from '../../session/auth-broadcast';
import { useAuthSession } from '../../session/auth-session';

/**
 * After the backend signed this browser in: the other tabs are told (one signed in as someone else
 * reloads), this one reads the session again, and the person goes on to `path`.
 */
export function useContinueSignedIn() {
  const router = useRouter();
  const { refetch } = useAuthSession();

  return async (path: string) => {
    broadcastAuthChange('signed-in');
    await refetch();
    startTransition(() => {
      router.replace(path, { scroll: false });
    });
  };
}
