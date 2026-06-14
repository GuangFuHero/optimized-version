import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PortalSiteShell } from '../../modules/auth/session/site-shell.client';

export const metadata: Metadata = {
  title: '島嶼守望 - 救災前台',
  description: '救災前台網站，提供使用者查看資訊、任務、站點等功能',
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <PortalSiteShell>{children}</PortalSiteShell>;
}
