// SPDX-License-Identifier: GPL-3.0-only
import { QueryClient } from '@tanstack/react-query';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';

import { AdminStationFacetsDocument } from '../graphql/__generated__/graphql';
import { GraphqlError } from '../graphql/request';

/** What the transport posts: the document's source, and the variables sent with it. */
const sentRequest = z.object({ query: z.string(), variables: z.json() });

const sent: z.infer<typeof sentRequest>[] = [];
let answer: () => Response;

async function fixtureFetch(_url: RequestInfo | URL, init?: RequestInit) {
  sent.push(sentRequest.parse(JSON.parse(String(init?.body))));

  return answer();
}

let stationFacetsQuery: typeof import('./graphql-fetchers').stationFacetsQuery;

beforeAll(async () => {
  // The transport takes its `fetch` when it is created, so the stand-in goes in first.
  vi.stubGlobal('fetch', fixtureFetch);
  ({ stationFacetsQuery } = await import('./graphql-fetchers'));
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
  return new Response(null, {
    status: 500,
    statusText: 'Internal Server Error',
  });
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

beforeEach(() => {
  sent.length = 0;
  answer = unavailable;
});

describe('stationFacetsQuery', () => {
  it('reads the review badge and status counts together without fetching station rows', async () => {
    const stationFacets = {
      total: 28,
      pendingReviewCount: 7,
      byStatus: [],
      byType: [],
      areas: [],
    };
    answer = () => answered({ stationFacets });
    const query = stationFacetsQuery();

    await expect(client().fetchQuery(query)).resolves.toEqual({
      stationFacets,
    });
    expect(sent).toEqual([
      { query: String(AdminStationFacetsDocument), variables: {} },
    ]);
    expect(sent[0]?.query).toMatch(
      /\bstationFacets\b[\s\S]*\bpendingReviewCount\b/,
    );
  });

  it('rejects a failed read so the status strip can offer a retry', async () => {
    await expect(
      client().fetchQuery(stationFacetsQuery()),
    ).rejects.toBeInstanceOf(GraphqlError);
    expect(sent).toHaveLength(1);
  });
});
