'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuthSession } from '../session/auth-session';
import {
  readApplyReturn,
  stripApplyReturn,
  type ApplyReturn,
} from './apply-return';

/**
 * Opens 申請管理權限 again for someone back from proving themselves at LINE (`apply=`). Read once,
 * from the router, as 請求協助's way back is (`HelpRequestReturn`); kept in its own component so
 * the shell can put it under a Suspense of its own, and reading the query does not turn a page
 * without one into a client-only page.
 */
export function RoleRequestReturn({
  onReturn,
}: {
  onReturn: (applyReturn: ApplyReturn) => void;
}) {
  const searchParams = useSearchParams();
  const { status } = useAuthSession();
  const [applyReturn] = useState(() => readApplyReturn(searchParams));
  const handled = useRef(false);

  useEffect(() => {
    if (!applyReturn || handled.current || status === 'loading') {
      return;
    }

    handled.current = true;

    // Off the address either way, so a reload or a copied link does not open it again. Signed out
    // meanwhile, there is no form to bring back.
    const address = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const without = stripApplyReturn(address);

    if (without !== address) {
      window.history.replaceState(window.history.state, '', without);
    }

    if (status === 'authenticated') {
      onReturn(applyReturn);
    }
  }, [applyReturn, onReturn, status]);

  return null;
}
