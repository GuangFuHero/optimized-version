import type { Metadata } from 'next';
import { preconnect } from 'react-dom';

import {
  DEFAULT_TILE_ORIGIN,
  resolvePointShareTargetFromRoute,
  SITE_OPEN_GRAPH,
} from '@rescue-frontend/modules';
import { requestOriginAsync } from '@rescue-frontend/modules/server';
import { SiteMapPageClient } from './site-map-page.client';

interface SiteMapPageProps {
  params?: Promise<{ segments?: string[] }> | { segments?: string[] };
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}

async function resolveMaybe<T>(value: T | Promise<T> | undefined, fallback: T) {
  return value ? await value : fallback;
}

export async function generateMetadata({
  params,
  searchParams,
}: SiteMapPageProps): Promise<Metadata> {
  const resolvedParams = await resolveMaybe(params, {});
  const resolvedSearchParams = await resolveMaybe(searchParams, {});
  const target = await resolvePointShareTargetFromRoute({
    module: 'map',
    segments: resolvedParams.segments ?? [],
    searchParams: resolvedSearchParams,
    origin: await requestOriginAsync(),
  });

  if (!target) {
    return {
      title: '救災地圖 - 島嶼守望',
      description: '檢視救災任務與站點資訊。',
    };
  }

  return {
    title: target.title,
    description: target.description,
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title: target.title,
      description: target.description,
      url: target.url,
    },
  };
}

export default function Page() {
  // The connection to the tile server is set up while the page's code loads: the first tile is
  // asked for only once the map has opened, and on a slow connection the handshake is round trips.
  preconnect(DEFAULT_TILE_ORIGIN);

  return <SiteMapPageClient />;
}
