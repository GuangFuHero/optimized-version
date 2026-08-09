import { NextResponse, type NextRequest } from 'next/server';

import { getBackendApiBaseUrl } from '../../../../../../../../../lib/backend-api-url';

const TILE_CACHE_SECONDS = 60 * 60 * 24 * 7;
const TILE_STALE_SECONDS = 60 * 60 * 24;
const TRANSPARENT_PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn3lS4AAAAASUVORK5CYII=',
    'base64',
  ),
);

function buildTileUrl(params: {
  type: string;
  source: string;
  z: string;
  x: string;
  y: string;
  layer?: string | null;
}) {
  const url = new URL(getBackendApiBaseUrl());
  url.pathname = `${url.pathname}/v1/map/tile/${params.type}/${params.source}/${params.z}/${params.x}/${params.y}`;

  if (params.layer) {
    url.searchParams.set('layer', params.layer);
  }

  return url;
}

function buildCacheControl() {
  return `public, max-age=${TILE_STALE_SECONDS}, s-maxage=${TILE_CACHE_SECONDS}, stale-while-revalidate=${TILE_STALE_SECONDS}`;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      type: string;
      source: string;
      z: string;
      x: string;
      y: string;
    }>;
  },
) {
  const params = await context.params;
  const backendUrl = buildTileUrl({
    ...params,
    layer: request.nextUrl.searchParams.get('layer'),
  });

  try {
    const response = await fetch(backendUrl, {
      next: {
        revalidate: TILE_CACHE_SECONDS,
      },
    });
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'content-type': contentType,
        'cache-control': buildCacheControl(),
      },
    });
  } catch {
    return new NextResponse(TRANSPARENT_PNG_BYTES, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'no-store',
      },
    });
  }
}
