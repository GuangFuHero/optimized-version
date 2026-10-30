import { Suspense } from 'react';

import type { Metadata } from 'next';

import {
  resolvePointShareTargetFromRoute,
  SITE_LIST_METADATA,
  SITE_OPEN_GRAPH,
  SiteListView,
} from '@rescue-frontend/modules';
import { requestOriginAsync } from '@rescue-frontend/modules/server';

interface SiteListPageProps {
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
}: SiteListPageProps): Promise<Metadata> {
  const resolvedParams = await resolveMaybe(params, {});
  const resolvedSearchParams = await resolveMaybe(searchParams, {});
  const target = await resolvePointShareTargetFromRoute({
    module: 'list',
    segments: resolvedParams.segments ?? [],
    searchParams: resolvedSearchParams,
    origin: await requestOriginAsync(),
  });

  if (!target) {
    // `SiteListView` names the page the same once nothing is open in place.
    return { ...SITE_LIST_METADATA };
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
  return (
    <Suspense fallback={null}>
      <SiteListView />
    </Suspense>
  );
}
