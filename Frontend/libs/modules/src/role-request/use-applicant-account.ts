'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCurrentUserAsync } from '../auth/api/client';
import { readApplicantAccount, type ApplicantAccount } from './applicant';

/**
 * The signed-in account as the application form needs it, read from `/users/me` while the drawer
 * is open: the session itself holds only the uuid and the nickname. Read again once a phone is
 * verified, which makes it the account's.
 */
export function useApplicantAccount(active: boolean) {
  const [account, setAccount] = useState<ApplicantAccount | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setAccount(readApplicantAccount(await getCurrentUserAsync()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (active) {
      void reload();
    }
  }, [active, reload]);

  return { account, failed, reload };
}
