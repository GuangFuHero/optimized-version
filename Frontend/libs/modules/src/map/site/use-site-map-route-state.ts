'use client';

import {
  createContext,
  createElement,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEventListener } from 'usehooks-ts';

import { parseSiteRouteState } from '../../route/parse';
import { useSiteRouteState } from '../../route/use-site-route-state';
import type { SiteRouteState } from '../../route/types';
import {
  createSiteMapViewportStore,
  SiteMapViewportStoreContext,
} from './use-site-map-viewport-state';

interface SiteMapRouteController {
  state: SiteRouteState;
  replace: (next: SiteRouteState) => void;
  replaceUrl: (next: SiteRouteState) => void;
}

const SiteMapRouteContext = createContext<SiteMapRouteController | null>(null);

export function SiteMapRouteProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = useSiteRouteState({ includeViewport: false });
  const [viewportStore] = useState(() => {
    const { position, bbox } = parseSiteRouteState(
      'map',
      pathname.slice('/map'.length).split('/').filter(Boolean),
      searchParams,
    );
    return createSiteMapViewportStore({ position, bbox });
  });

  useEventListener('popstate', () => {
    const { position, bbox } = parseSiteRouteState(
      'map',
      window.location.pathname.slice('/map'.length).split('/').filter(Boolean),
      new URLSearchParams(window.location.search),
    );
    viewportStore.setState({ position, bbox }, true);
  });

  const replace = (next: SiteRouteState) => {
    const current = viewportStore.getState();
    const position = next.position ?? current.position;
    const bbox = next.bbox ?? current.bbox;
    viewportStore.setState({ position, bbox }, true);
    route.replace({ ...next, position, bbox });
  };

  return createElement(
    SiteMapViewportStoreContext.Provider,
    { value: viewportStore },
    createElement(
      SiteMapRouteContext.Provider,
      { value: { state: route.state, replace, replaceUrl: replace } },
      children,
    ),
  );
}

export function useSiteMapRouteState(): SiteMapRouteController {
  const context = useContext(SiteMapRouteContext);
  if (!context)
    throw new Error('useSiteMapRouteState needs SiteMapRouteProvider');
  return context;
}

export function useOptionalSiteMapRouteState(): SiteMapRouteController | null {
  return useContext(SiteMapRouteContext);
}
