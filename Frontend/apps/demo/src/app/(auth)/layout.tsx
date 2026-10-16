import type { ReactNode } from 'react';

import { SiteTextScale } from '@rescue-frontend/modules';

/** The sign-in pages are the site's too, and read at the site's text scale. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <SiteTextScale>{children}</SiteTextScale>;
}
