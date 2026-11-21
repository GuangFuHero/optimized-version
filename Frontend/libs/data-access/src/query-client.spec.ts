import type { QueryMeta } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { GraphqlError } from './graphql/request';
import ApiError from './rest/api-error';
import { createAppQueryClient, SILENT_ERROR_META } from './query-client';

/** Runs one failing query through a fresh client and returns what `onError` received. */
async function reported(
  error: Error,
  meta?: QueryMeta,
  ignoreQueryError?: (error: Error) => boolean,
) {
  const onError = vi.fn<(error: Error) => void>();
  const client = createAppQueryClient(onError, ignoreQueryError);
  await client
    .fetchQuery({
      queryKey: ['test'],
      queryFn: () => Promise.reject(error),
      retry: false,
      meta,
    })
    .catch(() => undefined);
  return onError.mock.calls.map(([reportedError]) => reportedError);
}

/** Runs one failing mutation through a fresh client and returns what `onError` received. */
async function reportedMutation(
  error: Error,
  meta?: QueryMeta,
  ignoreQueryError?: (error: Error) => boolean,
) {
  const onError = vi.fn<(error: Error) => void>();
  const client = createAppQueryClient(onError, ignoreQueryError);
  await client
    .getMutationCache()
    .build(client, { mutationFn: () => Promise.reject(error), meta })
    .execute(undefined)
    .catch(() => undefined);
  return onError.mock.calls.map(([reportedError]) => reportedError);
}

const silent = { [SILENT_ERROR_META]: true };
const background = { quietErrors: true };
const expired = () => new ApiError(401, 'Could not validate credentials');

describe.each([
  ['SILENT_ERROR_META', silent],
  ['meta.quietErrors', background],
])('createAppQueryClient — %s', (_name, meta) => {
  it('keeps a query’s failure away from onError', async () => {
    expect(
      await reported(new ApiError(503, 'Service Unavailable'), meta),
    ).toEqual([]);
  });

  it('keeps a mutation’s failure away from onError', async () => {
    expect(
      await reportedMutation(new ApiError(500, 'Internal Server Error'), meta),
    ).toEqual([]);
  });

  it('still reports a 401, which is what signs an expired session out', async () => {
    for (const calls of [
      await reported(expired(), meta),
      await reportedMutation(expired(), meta),
    ]) {
      expect(calls).toMatchObject([{ status: 401 }]);
      expect(calls[0]).toBeInstanceOf(ApiError);
    }
  });

  it.each(['password_incorrect', 'step_up_invalid'])(
    'keeps a session-preserving 401 quiet (%s)',
    async (code) => {
      const error = new ApiError(401, 'Verification refused', code);
      expect(await reported(error, meta)).toEqual([]);
      expect(await reportedMutation(error, meta)).toEqual([]);
    },
  );

  it('still reports a 401 that comes back from GraphQL', async () => {
    const error = new GraphqlError({
      response: new Response(null, { status: 401 }),
      networkError: new Error('Unauthorized'),
    });
    const calls = await reported(error, meta);
    expect(calls).toMatchObject([{ status: 401 }]);
  });
});

describe('createAppQueryClient', () => {
  it('reports a failure from a query that did not opt out', async () => {
    const calls = await reported(new ApiError(500, 'Internal Server Error'));
    expect(calls).toMatchObject([{ status: 500 }]);
  });

  it('reports permission errors by default and lets callers handle query errors', async () => {
    const denied = new ApiError(403, 'Permission Denied.');
    const handlesPermissionError = (error: Error) => error === denied;
    expect(await reported(denied)).toEqual([denied]);
    expect(await reported(denied, undefined, handlesPermissionError)).toEqual(
      [],
    );
    expect(
      await reportedMutation(denied, undefined, handlesPermissionError),
    ).toEqual([denied]);
  });

  it('leaves a status a mutation explains itself unreported', async () => {
    const conflict = new ApiError(409, 'Already decided.');
    expect(
      await reportedMutation(conflict, { handledStatuses: [409] }),
    ).toEqual([]);
    expect(await reportedMutation(conflict)).toHaveLength(1);
  });
});
