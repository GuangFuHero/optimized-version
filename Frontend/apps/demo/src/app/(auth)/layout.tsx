import type { ReactNode } from 'react';

import {
  SiteAnnouncementBanner,
  SiteTextScale,
} from '@rescue-frontend/modules';

/**
 * The sign-in pages are the site's too: they read at the site's text scale and show its
 * announcement banner (prototype `site-auth.jsx:540`, EA-AB-147).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SiteTextScale>
      <SiteAnnouncementBanner />
      {children}
    </SiteTextScale>
  );
}
