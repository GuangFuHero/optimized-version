import { NextResponse } from 'next/server';

import { getBackendApiBaseUrl } from '../../../../../../lib/backend-api-url';

const ATTRIBUTION_CACHE_SECONDS = 60 * 60 * 24 * 7;
const ATTRIBUTION_STALE_SECONDS = 60 * 60 * 24;

function buildAttributionUrl(params: { type: string; source: string }) {
  const url = new URL(getBackendApiBaseUrl());
  url.pathname = `${url.pathname}/v1/map/attribution/${params.type}/${params.source}`;
  return url;
}

function buildCacheControl() {
  return `public, max-age=${ATTRIBUTION_STALE_SECONDS}, s-maxage=${ATTRIBUTION_CACHE_SECONDS}, stale-while-revalidate=${ATTRIBUTION_STALE_SECONDS}`;
}

export async function GET(context: {
  params: Promise<{
    type: string;
    source: string;
  }>;
}) {
  const params = await context.params;
  const backendUrl = buildAttributionUrl(params);

  try {
    const response = await fetch(backendUrl, {
      next: {
        revalidate: ATTRIBUTION_CACHE_SECONDS,
      },
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json',
        'cache-control': buildCacheControl(),
      },
    });
  } catch {
    return NextResponse.json(
      {
        attribution_text: '',
        requires_logo: false,
        logo_url: null,
      },
      {
        status: 200,
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  }
}
