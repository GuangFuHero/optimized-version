'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { preloadRescueMapCanvas } from '@rescue-frontend/modules';

// Fetched as this page's code runs, not once the map has read the event and laid itself out: on a
// slow connection that wait put the canvas and Leaflet behind everything else the page asks for.
if (typeof window !== 'undefined') {
  preloadRescueMapCanvas();
}

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
