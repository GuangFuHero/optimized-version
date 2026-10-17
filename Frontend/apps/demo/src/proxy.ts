import { refreshBeforeRenderAsync } from '@rescue-frontend/modules/server';
import type { NextRequest } from 'next/server';

/**
 * Next's middleware (named `proxy` since Next 16): refreshes a spent access token before a page
 * renders, since a Server Component cannot set cookies (backend login design §12).
 */
export function proxy(request: NextRequest) {
  return refreshBeforeRenderAsync(request);
}

export const config = {
  // Page navigations only. `/api/*` goes through the backend proxy, which refreshes on its own
  // (and the OAuth callback must reach it untouched); `_next/*` and static files need no session.
  // Files by their extension, not by any dot: the map's address carries `@25.03,121.56,14z`.
  matcher: [
    '/((?!api/|_next/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|txt|xml|webmanifest|js|css|map|woff2?)$).*)',
  ],
};
