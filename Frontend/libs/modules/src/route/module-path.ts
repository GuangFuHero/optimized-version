import { SITE_MODULES } from './constants';
import type { SiteModule } from './types';

/** The module whose own page the address is: `/map…` or `/list…`. */
function moduleOfPath(pathname: string): SiteModule | undefined {
  return SITE_MODULES.find(
    (module) => pathname === `/${module}` || pathname.startsWith(`/${module}/`),
  );
}

/**
 * The module the route state reads from an address. The site's other pages (行前資訊, a 404) read as
 * the map: the frame around them still needs a route state.
 */
export function resolveModule(pathname: string): SiteModule {
  return moduleOfPath(pathname) ?? 'map';
}

/**
 * Whether the address is the map's or the list's own page — on any other, `resolveModule`'s map is a
 * stand-in, and nothing should light the map as where the visitor is.
 */
export function isSiteModulePath(pathname: string): boolean {
  return moduleOfPath(pathname) !== undefined;
}
