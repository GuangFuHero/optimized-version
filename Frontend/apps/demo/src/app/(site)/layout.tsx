import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  PortalSiteShell,
  SITE_OPEN_GRAPH,
  SiteTextScale,
} from '@rescue-frontend/modules';
import { requestOriginAsync } from '@rescue-frontend/modules/server';

export async function generateMetadata(): Promise<Metadata> {
  return {
    // Relative URLs, the share card's included, resolve on the site's origin: `SITE_APP_URL`, or in
    // local development the host the request came in on. Without a base, Next resolves them on
    // localhost, which no link preview can fetch. Always a valid origin, so this never throws.
    metadataBase: new URL(await requestOriginAsync()),
    title: '島嶼守望 - 救災前台',
    description: '救災前台網站，提供使用者查看資訊、任務、站點等功能',
    // No title or description of its own: each page's own fill them in.
    openGraph: SITE_OPEN_GRAPH,
    twitter: { card: 'summary_large_image' },
  };
}

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <SiteTextScale>
      <PortalSiteShell>{children}</PortalSiteShell>
    </SiteTextScale>
  );
}
