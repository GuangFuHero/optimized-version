'use client';

import { usePathname, useRouter } from 'next/navigation';
import { parseAsString, useQueryStates } from 'nuqs';

import { resolveModule } from './module-path';
import { parseSiteRouteState } from './parse';
import { createSiteHref } from './serialize';
import type { SiteModule, SiteRouteState } from './types';

const queryParsers = {
  id: parseAsString,
  search: parseAsString,
  bbox: parseAsString,
  pos: parseAsString,
};

export interface SiteRouteController {
  module: SiteModule;
  state: SiteRouteState;
  replace: (next: SiteRouteState) => void;
  switchModule: (target: SiteModule) => void;
}

/** Next owns the path; nuqs owns query updates and browser history synchronization. */
export function useSiteRouteState({
  includeViewport = true,
} = {}): SiteRouteController {
  const router = useRouter();
  const pathname = usePathname();
  const module = resolveModule(pathname);
  const [query, setQuery] = useQueryStates(queryParsers);
  const path = includeViewport ? pathname : pathname.replace(/\/@[^/]+z$/, '');
  const segments = path.slice(`/${module}`.length).split('/').filter(Boolean);
  const state = parseSiteRouteState(module, segments, {
    get: (name) => {
      switch (name) {
        case 'id':
          return query.id;
        case 'search':
          return query.search;
        case 'bbox':
          return includeViewport ? query.bbox : null;
        case 'pos':
          return includeViewport ? query.pos : null;
        default:
          return null;
      }
    },
  });

  const replace = (next: SiteRouteState) => {
    const path = createSiteHref(module, {
      ...next,
      selectedMarkerId: undefined,
      search: undefined,
    });
    if (path !== window.location.pathname) {
      window.history.replaceState(
        window.history.state,
        '',
        path + window.location.search,
      );
    }
    void setQuery({
      id: next.selectedMarkerId ?? null,
      search: next.search ?? null,
      bbox: null,
      pos: null,
    });
  };
  const switchModule = (target: SiteModule) => {
    if (target !== module)
      router.replace(createSiteHref(target, state), { scroll: false });
  };

  return { module, state, replace, switchModule };
}
