import type { Metadata } from 'next';

import {
  PortalSiteShell,
  SiteNotFound,
  SiteTextScale,
} from '@rescue-frontend/modules';

export const metadata: Metadata = {
  title: '找不到這一頁 - 島嶼守望',
};

/**
 * Any address the app has no page for. The root layout holds no frame, so this puts the site's own
 * around it, as `(site)/layout.tsx` does: the sidebar and top bar stay, so a lost visitor can see
 * they are still on the site and go on from there.
 */
export default function NotFound() {
  return (
    <SiteTextScale>
      <PortalSiteShell>
        <SiteNotFound />
      </PortalSiteShell>
    </SiteTextScale>
  );
}
