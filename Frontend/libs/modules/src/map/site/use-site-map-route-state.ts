'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { parseSiteRouteState, type SiteQuerySource } from '../../route/parse';
import { createSiteHref } from '../../route/serialize';
import type { SiteRouteState } from '../../route/types';
import {
  createSiteMapViewportStore,
  SiteMapViewportStoreContext,
  type SiteMapViewportState,
} from './use-site-map-viewport-state';

interface SiteMapRouteSnapshot {
  state: SiteRouteState;
  href: string;
}

interface SiteMapRouteController {
  state: SiteRouteState;
  replace: (next: SiteRouteState) => void;
  replaceUrl: (next: SiteRouteState) => void;
}

interface SiteMapRouteProviderProps {
  children: ReactNode;
}

const SiteMapRouteContext = createContext<SiteMapRouteController | null>(null);

function splitViewportState(state: SiteRouteState): {
  routeState: SiteRouteState;
  viewportState: SiteMapViewportState;
} {
  const { position, bbox, ...routeState } = state;

  return {
    routeState,
    viewportState: {
      position,
      bbox,
    },
  };
}

function mergeViewportState(
  state: SiteRouteState,
  viewportState: SiteMapViewportState,
): SiteRouteState {
  return {
    ...state,
    position: state.position ?? viewportState.position,
    bbox: state.bbox ?? viewportState.bbox,
  };
}

function readSnapshot(
  pathname: string,
  query: SiteQuerySource,
): SiteMapRouteSnapshot {
  const segments = pathname
    .slice('/map'.length)
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  const state = parseSiteRouteState('map', segments, query);

  return { state, href: createSiteHref('map', state) };
}

function readSnapshotFromLocation(): SiteMapRouteSnapshot {
  return readSnapshot(
    window.location.pathname,
    new URLSearchParams(window.location.search),
  );
}

export function SiteMapRouteProvider({ children }: SiteMapRouteProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Read once, from the router rather than `window.location`: on a client-side navigation into the
  // map — back from signing in, say — the page renders before the browser's address changes, and
  // `window.location` still names the page the user came from. Read from there, the map would take
  // the login page's address for a route, fall back to the defaults and write them over the right
  // address.
  const [externalSnapshot] = useState(() => readSnapshot(pathname, searchParams));
  const initialSplitState = useMemo(
    () => splitViewportState(externalSnapshot.state),
    [externalSnapshot.state],
  );
  const viewportStoreRef = useRef(
    createSiteMapViewportStore(initialSplitState.viewportState),
  );
  const [snapshot, setSnapshot] = useState<SiteMapRouteSnapshot>({
    state: initialSplitState.routeState,
    href: externalSnapshot.href,
  });

  useEffect(() => {
    const handlePopState = () => {
      const nextSnapshot = readSnapshotFromLocation();
      const nextSplitState = splitViewportState(nextSnapshot.state);

      viewportStoreRef.current.setState(nextSplitState.viewportState);
      setSnapshot({
        state: nextSplitState.routeState,
        href: nextSnapshot.href,
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const replace = useCallback((next: SiteRouteState) => {
    if (typeof window === 'undefined') {
      return;
    }

    const fullState = mergeViewportState(
      next,
      viewportStoreRef.current.getSnapshot(),
    );
    const nextSplitState = splitViewportState(fullState);
    const href = createSiteHref('map', fullState);
    const current = snapshotRef.current;

    if (href === current.href) {
      return;
    }

    window.history.replaceState(window.history.state, '', href);
    viewportStoreRef.current.setState(nextSplitState.viewportState);
    setSnapshot({ state: nextSplitState.routeState, href });
  }, []);

  const replaceUrl = useCallback((next: SiteRouteState) => {
    if (typeof window === 'undefined') {
      return;
    }

    const fullState = mergeViewportState(
      next,
      viewportStoreRef.current.getSnapshot(),
    );
    const nextSplitState = splitViewportState(fullState);
    const href = createSiteHref('map', fullState);
    const currentHref = `${window.location.pathname}${window.location.search}`;

    viewportStoreRef.current.setState(nextSplitState.viewportState);

    if (href === currentHref) {
      return;
    }

    window.history.replaceState(window.history.state, '', href);
  }, []);

  const controller = useMemo<SiteMapRouteController>(
    () => ({
      state: snapshot.state,
      replace,
      replaceUrl,
    }),
    [replace, replaceUrl, snapshot.state],
  );

  return createElement(
    SiteMapViewportStoreContext.Provider,
    { value: viewportStoreRef.current },
    createElement(
      SiteMapRouteContext.Provider,
      { value: controller },
      children,
    ),
  );
}

export function useSiteMapRouteState(): SiteMapRouteController {
  const context = useContext(SiteMapRouteContext);

  if (!context) {
    throw new Error(
      'useSiteMapRouteState must be used within SiteMapRouteProvider',
    );
  }

  return context;
}

export function useOptionalSiteMapRouteState(): SiteMapRouteController | null {
  return useContext(SiteMapRouteContext);
}
