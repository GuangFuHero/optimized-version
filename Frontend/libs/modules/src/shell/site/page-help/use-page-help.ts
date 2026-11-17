'use client';

import { usePathname } from 'next/navigation';

import { SITE_PAGE_HELP, pageHelpKey, type PageHelp } from './page-help';
import { usePageHelpSeen } from './use-page-help-seen';

export interface CurrentPageHelp {
  help: PageHelp;
  /** Not opened on this device yet: the ？ carries a dot (prototype `wg-help.jsx`). */
  fresh: boolean;
  markSeen: () => void;
}

/** This page's help, or null on a page without any (行前資訊, the account pages). */
export function usePageHelp(): CurrentPageHelp | null {
  const key = pageHelpKey(usePathname() ?? '');
  const { seen, markSeen } = usePageHelpSeen(key);

  return key ? { help: SITE_PAGE_HELP[key], fresh: !seen, markSeen } : null;
}
