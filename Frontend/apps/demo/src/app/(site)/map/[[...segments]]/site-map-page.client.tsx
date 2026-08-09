'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

const SiteMapView = dynamic(
  () =>
    import('./site-map-view.client').then((module) => module.SiteMapView),
  {
    ssr: false,
    loading: () => null,
  },
);

const LEAFLET_MOUNT_DELAY_MS = 120;

export function SiteMapPageClient() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsReady(true);
    }, LEAFLET_MOUNT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      setIsReady(false);
    };
  }, []);

  return isReady ? <SiteMapView /> : null;
}
