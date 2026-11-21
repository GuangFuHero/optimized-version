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

import { GraphqlError } from '../graphql/request';

/** What a paging read asks for: the page's place in the list, and how many areas to take. */
const pageRequest = z.object({
  variables: z.object({ skip: z.number(), limit: z.number() }),
});

/** One answer per asked page, by the page's skip. */
const replies = new Map<number, () => Response>();
const asked: number[] = [];

async function fixtureFetch(_url: RequestInfo | URL, init?: RequestInit) {
  const { variables } = pageRequest.parse(JSON.parse(String(init?.body)));
  asked.push(variables.skip);

  const reply = replies.get(variables.skip);
  if (!reply) throw new Error(`nothing answers the page at ${variables.skip}`);

  return reply();
}

let adminMapAreasQuery: typeof import('./map-queries').adminMapAreasQuery;
let SILENT_ERROR_META: typeof import('../query-client').SILENT_ERROR_META;

beforeAll(async () => {
  // The transport takes its `fetch` when it is created, so the stand-in goes in first.
  vi.stubGlobal('fetch', fixtureFetch);
  ({ adminMapAreasQuery } = await import('./map-queries'));
  ({ SILENT_ERROR_META } = await import('../query-client'));
});

afterAll(() => vi.unstubAllGlobals());

/** A page as `GetMapAreas` returns it, its areas named by their place in the list. */
function page(skip: number, count: number, totalCount: number) {
  return {
    areas: {
      items: Array.from({ length: count }, (_, index) => ({
        uuid: `area-${skip + index}`,
      })),
      pageInfo: {
        totalCount,
        hasNextPage: skip + count < totalCount,
        hasPreviousPage: skip > 0,
      },
    },
  };
}

/** The proxy answering with data, as it does when the read is served. */
function answered<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    headers: { 'content-type': 'application/json' },
  });
}

/** The proxy answering with a failed read, as it does when the backend cannot serve it. */
function unavailable(status: number) {
  return new Response(null, { status });
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

/** The GraphQL error a read rejected with, for what its response says happened. */
async function failedReading<T>(read: Promise<T>): Promise<GraphqlError> {
  try {
    await read;
  } catch (cause) {
    if (cause instanceof GraphqlError) return cause;
    throw cause;
  }
  throw new Error('the read was expected to fail');
}

beforeEach(() => {
  replies.clear();
  asked.length = 0;
});

describe('adminMapAreasQuery', () => {
  it('keeps the areas an earlier page gave when a later page fails, and flags the source as partial', async () => {
    replies.set(0, () => answered(page(0, 100, 150)));
    replies.set(100, () => unavailable(503));

    const result = await client().fetchQuery(adminMapAreasQuery(true));

    expect(result.items.map((area) => area.uuid)).toEqual(
      Array.from({ length: 100 }, (_, index) => `area-${index}`),
    );
    expect(result.hasError).toBe(true);
    expect(asked).toEqual([0, 100]);
  });

  it('rejects when the first page fails: there is nothing to stand in for the areas', async () => {
    replies.set(0, () => unavailable(503));

    const error = await failedReading(
      client().fetchQuery(adminMapAreasQuery(true)),
    );

    expect(error.response?.status).toBe(503);
  });

  it('rejects a partial read whose later page says the session ended, so it is not shown as merely partial', async () => {
    replies.set(0, () => answered(page(0, 100, 150)));
    replies.set(100, () => unavailable(401));

    const error = await failedReading(
      client().fetchQuery(adminMapAreasQuery(true)),
    );

    expect(error.response?.status).toBe(401);
  });

  it('promotes a 401 even when other pages failed too, so a session that ended is not filed as partial', async () => {
    replies.set(0, () => answered(page(0, 100, 350)));
    replies.set(100, () => unavailable(503));
    replies.set(200, () => unavailable(401));

    const error = await failedReading(
      client().fetchQuery(adminMapAreasQuery(true)),
    );

    expect(error.response?.status).toBe(401);
  });

  it('says when the page cap cut the list short, so the list is not read as every area', async () => {
    replies.set(0, () => answered(page(0, 100, 5000)));
    for (let skip = 100; skip < 1000; skip += 100) {
      replies.set(skip, () => answered(page(skip, 100, 5000)));
    }

    const result = await client().fetchQuery(adminMapAreasQuery(true));

    expect(result.items).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(result.hasError).toBe(false);
  });

  it('is whole and error-free when every page answers', async () => {
    replies.set(0, () => answered(page(0, 100, 150)));
    replies.set(100, () => answered(page(100, 50, 150)));

    const result = await client().fetchQuery(adminMapAreasQuery(true));

    expect(result.items).toHaveLength(150);
    expect(result.hasError).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('shows its own error state, so a partial source is not also toasted', () => {
    expect(adminMapAreasQuery(true).meta).toMatchObject({
      [SILENT_ERROR_META]: true,
    });
  });
});
