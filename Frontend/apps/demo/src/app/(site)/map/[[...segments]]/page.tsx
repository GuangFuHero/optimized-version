import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { resolvePointShareTargetFromRoute } from '@rescue-frontend/modules';
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

async function resolveRequestOrigin() {
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';

  return host
    ? `${protocol}://${host}`
    : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000');
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
    origin: await resolveRequestOrigin(),
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
      title: target.title,
      description: target.description,
      url: target.url,
      type: 'website',
      images: ['/wan-guard.svg'],
    },
  };
}

export default function Page() {
  return <SiteMapPageClient />;
}
