import type { ReactNode } from 'react';

import {
  SiteAnnouncementBanner,
  SiteTextScale,
} from '@rescue-frontend/modules';

/**
 * Someone arriving from a team's QR code lands here straight from LINE, with no site shell, as on
 * the sign-in pages: the same text scale and announcement banner (EA-AB-147).
 */
export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <SiteTextScale>
      <SiteAnnouncementBanner />
      {children}
    </SiteTextScale>
  );
}
