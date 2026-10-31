import { CombinedError } from 'urql';
import { describe, expect, it, vi } from 'vitest';

import ApiError from '../rest/api-error';
import {
  createAdminQueryClient,
  forbidsPage,
  SILENT_ERROR_META,
} from './query-client';

/** Runs one failing query through a fresh admin client and returns what `onError` received. */
async function reported(error: Error, silent: boolean) {
  const onError = vi.fn();
  const client = createAdminQueryClient(onError);
  await client
    .fetchQuery({
      queryKey: ['test'],
      queryFn: () => Promise.reject(error),
      retry: false,
      meta: silent ? { [SILENT_ERROR_META]: true } : undefined,
    })
    .catch(() => undefined);
  return onError.mock.calls.map(([reportedError]) => reportedError as Error);
}

describe('createAdminQueryClient — SILENT_ERROR_META', () => {
  it('keeps a silent query’s failure away from onError: the card shows it instead', async () => {
    expect(
      await reported(new ApiError(500, 'Internal Server Error'), true),
    ).toEqual([]);
  });

  it('still reports a silent query’s 401, which is what signs an expired session out', async () => {
    const calls = await reported(
      new ApiError(401, 'Could not validate credentials'),
      true,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeInstanceOf(ApiError);
    expect((calls[0] as ApiError).status).toBe(401);
  });

  it('still reports a 401 that comes back from GraphQL', async () => {
    const error = new CombinedError({
      response: new Response(null, { status: 401 }),
      networkError: new Error('Unauthorized'),
    });
    const calls = await reported(error, true);
    expect(calls).toHaveLength(1);
    expect((calls[0] as ApiError).status).toBe(401);
  });

  it('reports a failure from a query that did not opt out', async () => {
    const calls = await reported(
      new ApiError(500, 'Internal Server Error'),
      false,
    );
    expect(calls).toHaveLength(1);
    expect((calls[0] as ApiError).status).toBe(500);
  });

  it('keeps a permission 403 from onError whether or not the query opted out: the shell shows 403', async () => {
    for (const silent of [true, false]) {
      expect(
        await reported(new ApiError(403, 'Permission Denied.'), silent),
      ).toEqual([]);
    }
    const graphql = new CombinedError({
      graphQLErrors: ['403: Permission Denied.'],
    });
    expect(await reported(graphql, false)).toEqual([]);
  });

  it('still reports a 403 that is not about permissions', async () => {
    const calls = await reported(
      new ApiError(403, 'Origin not allowed.', 'origin_not_allowed'),
      false,
    );
    expect(calls).toHaveLength(1);
    expect((calls[0] as ApiError).code).toBe('origin_not_allowed');
  });
});

describe('forbidsPage', () => {
  /** Runs one failing query and returns it as the shell finds it in the cache. */
  async function failed(error: Error, silent: boolean) {
    const client = createAdminQueryClient(vi.fn());
    await client
      .fetchQuery({
        queryKey: ['admin', 'test'],
        queryFn: () => Promise.reject(error),
        retry: false,
        meta: silent ? { [SILENT_ERROR_META]: true } : undefined,
      })
      .catch(() => undefined);
    const query = client.getQueryCache().find({ queryKey: ['admin', 'test'] });
    if (!query) throw new Error('query missing from the cache');
    return query;
  }

  it('turns the page into the 403 page for a query that shows no error state of its own', async () => {
    expect(
      forbidsPage(await failed(new ApiError(403, 'Permission Denied.'), false)),
    ).toBe(true);
  });

  it('leaves the page alone for a silent query’s 403: its card or section shows it', async () => {
    expect(
      forbidsPage(await failed(new ApiError(403, 'Permission Denied.'), true)),
    ).toBe(false);
  });

  it('leaves the page alone for a failure that is not about permissions', async () => {
    expect(
      forbidsPage(
        await failed(new ApiError(500, 'Internal Server Error'), false),
      ),
    ).toBe(false);
  });
});
