// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  ADDRESS_LOOKUP_OPTIONS,
  ApiError,
  NormalizeAddressDocument,
  ReverseGeocodeDocument,
  createAppQueryClient,
  createGraphqlRequest,
  reverseGeocodeQueryOptions,
  type AddressLookupSource,
} from '@rescue-frontend/data-access';
import { adminAddressLookup } from '@rescue-frontend/data-access/admin';

import type { AddressCheck, AddressLookup, LatLng } from './address-lookup';
import {
  usePinAddressLookup,
  useTypedAddressLookup,
} from './use-address-lookup';

const sentRequest = z.object({
  query: z.string(),
  variables: z.json(),
});

const FOUND_DOOR = {
  status: 'found',
  fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
  lat: 23.658676,
  lng: 121.420631,
  buildingSection: null,
  floor: null,
  room: null,
  addressToken: 'token-19',
};

function answered<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    headers: { 'content-type': 'application/json' },
  });
}

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function renderWithClient(
  element: ReturnType<typeof createElement>,
  queryClient: QueryClient = client,
) {
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, element),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient();
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe('address lookup options and hooks', () => {
  it('posts rounded reverseGeocode variables through the injected source', async () => {
    const sent: {
      method: string;
      query: string;
      variables: z.infer<typeof sentRequest>['variables'];
    }[] = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const parsed = sentRequest.parse(JSON.parse(String(init?.body)));
      sent.push({
        method: init?.method ?? '',
        query: parsed.query,
        variables: parsed.variables,
      });
      return answered({ reverseGeocode: FOUND_DOOR });
    });
    const source: AddressLookupSource = {
      scope: 'site',
      request: createGraphqlRequest({ fetch: transport }),
    };

    let observed: AddressLookup | null = null;
    function Probe({ pin }: { pin: LatLng | null }) {
      observed = usePinAddressLookup(pin, source);
      return null;
    }

    await renderWithClient(
      createElement(Probe, { pin: { lat: 23.65870000001, lng: 121.4206 } }),
    );

    expect(sent).toEqual([
      {
        method: 'POST',
        query: String(ReverseGeocodeDocument),
        variables: { lat: 23.6587, lng: 121.4206 },
      },
    ]);
    expect(observed).toEqual({
      status: 'found',
      door: {
        fullAddress: FOUND_DOOR.fullAddress,
        token: 'token-19',
        lat: FOUND_DOOR.lat,
        lng: FOUND_DOOR.lng,
        buildingSection: null,
        floor: null,
        room: null,
      },
    });
  });

  it('posts normalizeAddress variables through the injected source', async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const parsed = sentRequest.parse(JSON.parse(String(init?.body)));
      expect(init?.method).toBe('POST');
      expect(parsed.query).toBe(String(NormalizeAddressDocument));
      expect(parsed.variables).toEqual({
        address: '糖廠街19號',
        lat: 23.6587,
        lng: 121.4206,
      });
      return answered({ normalizeAddress: FOUND_DOOR });
    });
    const source: AddressLookupSource = {
      scope: 'admin',
      request: createGraphqlRequest({ fetch: transport }),
    };

    let observed: AddressLookup | null = null;
    function Probe({ check }: { check: AddressCheck | null }) {
      observed = useTypedAddressLookup(check, source);
      return null;
    }

    await renderWithClient(
      createElement(Probe, {
        check: { address: '糖廠街19號', lat: 23.6587, lng: 121.4206 },
      }),
    );

    expect(transport).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({ status: 'found' });
  });

  it('drops unmounted lookup results so a later mount retries after unavailable', async () => {
    let calls = 0;
    const source: AddressLookupSource = {
      scope: 'site',
      request: createGraphqlRequest({
        fetch: async () => {
          calls += 1;
          return answered({
            reverseGeocode:
              calls === 1
                ? { ...FOUND_DOOR, status: 'unavailable' }
                : FOUND_DOOR,
          });
        },
      }),
    };

    let observed: AddressLookup | null = null;
    function Probe() {
      observed = usePinAddressLookup({ lat: 23.6587, lng: 121.4206 }, source);
      return null;
    }

    await renderWithClient(createElement(Probe));
    expect(observed).toEqual({ status: 'unavailable' });

    await act(async () => root.unmount());
    root = createRoot(container);

    await renderWithClient(createElement(Probe));
    expect(calls).toBe(2);
    expect(observed).toMatchObject({ status: 'found' });
  });

  it('shares rounded key and cache options across reverse geocode callers', () => {
    const options = reverseGeocodeQueryOptions(adminAddressLookup, {
      lat: 23.1234567,
      lng: 121.7654321,
    });

    expect(options.queryKey).toEqual([
      'admin',
      'address',
      'reverseGeocode',
      { lat: 23.123457, lng: 121.765432 },
    ]);
    expect(options).toMatchObject(ADDRESS_LOOKUP_OPTIONS);
  });

  it('keeps non-401 lookup failures quiet while surfacing 401 on the admin client', async () => {
    const reported: Error[] = [];
    const adminClient = createAppQueryClient((error) => reported.push(error));
    let status = 503;
    const source: AddressLookupSource = {
      scope: 'admin',
      request: createGraphqlRequest({
        fetch: async () => new Response(null, { status }),
      }),
    };

    let observed: AddressLookup | null = null;
    function Probe({ pin }: { pin: LatLng }) {
      observed = usePinAddressLookup(pin, source);
      return null;
    }

    await renderWithClient(
      createElement(Probe, { pin: { lat: 23.6587, lng: 121.4206 } }),
      adminClient,
    );
    expect(observed).toEqual({ status: 'unavailable' });
    expect(reported).toEqual([]);

    status = 401;
    await renderWithClient(
      createElement(Probe, { pin: { lat: 23.659, lng: 121.421 } }),
      adminClient,
    );
    expect(observed).toEqual({ status: 'unavailable' });
    expect(reported).toHaveLength(1);
    const firstError = reported[0];
    expect(firstError).toBeInstanceOf(ApiError);
    if (firstError instanceof ApiError) {
      expect(firstError.status).toBe(401);
    }

    adminClient.clear();
  });
});
