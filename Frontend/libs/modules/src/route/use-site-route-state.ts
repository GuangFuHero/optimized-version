'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { parseSiteRouteState } from './parse';
import { createSiteHref } from './serialize';
import type { SiteModule, SiteRouteState } from './types';

function resolveModule(pathname: string): SiteModule {
  return pathname.startsWith('/list') ? 'list' : 'map';
}

function extractSegments(pathname: string, module: SiteModule): string[] {
  const prefix = module === 'list' ? '/list' : '/map';
  const rest = pathname.slice(prefix.length).replace(/^\/+/, '');

  return rest ? rest.split('/').filter(Boolean) : [];
}

interface SiteRouteSnapshot {
  module: SiteModule;
  state: SiteRouteState;
  href: string;
}

export interface SiteRouteController {
  module: SiteModule;
  state: SiteRouteState;
  /** 以完整狀態覆寫網址（UI → 網址）。 */
  replace: (next: SiteRouteState) => void;
  /** 切換顯示模組並保留目前的篩選/詳情狀態。 */
  switchModule: (target: SiteModule) => void;
}

interface SiteRouteProviderProps {
  children: ReactNode;
}

const SiteRouteContext = createContext<SiteRouteController | null>(null);

function createPathSnapshot(pathname: string | null | undefined): SiteRouteSnapshot {
  const resolvedPathname = pathname || '/list';
  const module = resolveModule(resolvedPathname);
  const state = parseSiteRouteState(
    module,
    extractSegments(resolvedPathname, module),
    new URLSearchParams(),
  );

  return {
    module,
    state,
    href: createSiteHref(module, state),
  };
}

function readSnapshotFromLocation(): SiteRouteSnapshot {
  if (typeof window === 'undefined') {
    return createPathSnapshot('/list');
  }

  const pathname = window.location.pathname;
  const module = resolveModule(pathname);
  const state = parseSiteRouteState(
    module,
    extractSegments(pathname, module),
    new URLSearchParams(window.location.search),
  );

  return { module, state, href: createSiteHref(module, state) };
}

export function SiteRouteProvider({ children }: SiteRouteProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const externalSnapshot = useMemo(
    () => createPathSnapshot(pathname),
    [pathname],
  );
  const [snapshot, setSnapshot] = useState<SiteRouteSnapshot>(externalSnapshot);

  useEffect(() => {
    const handlePopState = () => {
      setSnapshot(readSnapshotFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    setSnapshot((current) =>
      current.href === externalSnapshot.href ? current : externalSnapshot,
    );
  }, [externalSnapshot]);

  useEffect(() => {
    const nextSnapshot = readSnapshotFromLocation();

    setSnapshot((current) =>
      current.href === nextSnapshot.href ? current : nextSnapshot,
    );
  }, [pathname]);

  const replace = useCallback((next: SiteRouteState) => {
    if (typeof window === 'undefined') {
      return;
    }

    const current = snapshotRef.current;
    const href = createSiteHref(current.module, next);

    if (href === current.href) {
      return;
    }

    window.history.replaceState(window.history.state, '', href);
    setSnapshot({
      module: current.module,
      state: next,
      href,
    });
  }, []);

  const switchModule = useCallback(
    (target: SiteModule) => {
      const current = snapshotRef.current;

      if (target === current.module) {
        return;
      }

      router.replace(createSiteHref(target, current.state), {
        scroll: false,
      });
    },
    [router],
  );

  const controller = useMemo<SiteRouteController>(
    () => ({
      module: snapshot.module,
      state: snapshot.state,
      replace,
      switchModule,
    }),
    [replace, snapshot.module, snapshot.state, switchModule],
  );

  return createElement(
    SiteRouteContext.Provider,
    { value: controller },
    children,
  );
}

/**
 * 前台網址 ↔ UI 狀態的雙向綁定來源。
 * 讀取目前網址解析為 {@link SiteRouteState}，並提供寫回網址的方法。
 */
export function useSiteRouteState(): SiteRouteController {
  const context = useContext(SiteRouteContext);

  if (context) {
    return context;
  }

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const module = resolveModule(pathname);
  const state = useMemo(
    () =>
      parseSiteRouteState(
        module,
        extractSegments(pathname, module),
        searchParams,
      ),
    [module, pathname, searchParams],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const replace = useCallback(
    (next: SiteRouteState) => {
      router.replace(createSiteHref(module, next), { scroll: false });
    },
    [module, router],
  );

  const switchModule = useCallback(
    (target: SiteModule) => {
      if (target === module) {
        return;
      }

      router.replace(createSiteHref(target, stateRef.current), {
        scroll: false,
      });
    },
    [module, router],
  );

  return { module, state, replace, switchModule };
}
