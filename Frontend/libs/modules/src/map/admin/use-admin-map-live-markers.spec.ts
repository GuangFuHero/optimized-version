// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  GetAdminMapTicketsDocument,
  GetStationsDocument,
} from '@rescue-frontend/data-access';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';

import { createMapViewportStore } from '../viewport-store';

/** Which source the transport refuses: the other one still answers. */
const refused = new Set<'tickets' | 'stations'>();

const ticket = {
  uuid: 'ticket-1',
  title: '清理淤泥',
  description: null,
  taskType: 'cleanup',
  geometry: { type: 'Point', coordinates: [121.43, 23.67] },
  status: 'pending',
  priority: 'high',
};

const station = {
  uuid: 'station-1',
  name: '物資站',
  type: 'shelter',
  geometry: { type: 'Point', coordinates: [121.44, 23.68] },
  isTemporary: false,
};

/** What the transport posts: the document it sends to the proxy. */
const sentRequest = z.object({ query: z.string() });

async function fixtureFetch(_url: RequestInfo | URL, init?: RequestInit) {
  const { query } = sentRequest.parse(JSON.parse(String(init?.body)));

  if (query === String(GetAdminMapTicketsDocument)) {
    return refused.has('tickets')
      ? unavailable()
      : answered({
          tickets: { items: [ticket], pageInfo: { totalCount: 1 } },
        });
  }

  if (query === String(GetStationsDocument)) {
    return refused.has('stations')
      ? unavailable()
      : answered({
          stations: { items: [station], pageInfo: { totalCount: 1 } },
        });
  }

  throw new Error('the map asked for a document the fixture does not answer');
}

let useAdminMapLiveMarkers: typeof import('./use-admin-map-live-markers').useAdminMapLiveMarkers;

beforeAll(async () => {
  // The transport takes its `fetch` when it is created, so the stand-in goes in first.
  vi.stubGlobal('fetch', fixtureFetch);
  ({ useAdminMapLiveMarkers } = await import('./use-admin-map-live-markers'));
});

afterAll(() => vi.unstubAllGlobals());

/** The proxy answering with data, as it does when the read is served. */
function answered<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    headers: { 'content-type': 'application/json' },
  });
}

/** The proxy reporting a failed read, the backend unwell. */
function unavailable() {
  return new Response(null, { status: 503, statusText: 'Service Unavailable' });
}

const viewportStore = createMapViewportStore({
  bbox: [121.4, 23.6, 121.5, 23.7],
  position: { center: [23.65, 121.45], zoom: 15 },
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

function Pins() {
  const { markers, ticketReadFailed, stationReadFailed } =
    useAdminMapLiveMarkers(viewportStore);

  return createElement(
    'span',
    null,
    `ids:${markers.map((marker) => marker.id).join(',')};` +
      `tickets:${ticketReadFailed};stations:${stationReadFailed}`,
  );
}

async function mount() {
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Pins)),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  refused.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe('useAdminMapLiveMarkers', () => {
  it('shows both sources side by side when both read', async () => {
    await mount();

    expect(container.textContent).toBe(
      'ids:ticket-1,station-1;tickets:false;stations:false',
    );
  });

  it('keeps the stations when only the tickets fail to read', async () => {
    refused.add('tickets');
    await mount();

    expect(container.textContent).toBe(
      'ids:station-1;tickets:true;stations:false',
    );
  });

  it('keeps the tickets when only the stations fail to read', async () => {
    refused.add('stations');
    await mount();

    expect(container.textContent).toBe(
      'ids:ticket-1;tickets:false;stations:true',
    );
  });
});
