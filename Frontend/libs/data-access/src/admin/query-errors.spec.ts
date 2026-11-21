import { QueryClient, type QueryMeta } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { GraphqlError } from '../graphql/request';
import ApiError from '../rest/api-error';
import { isPermissionError, SILENT_ERROR_META } from '../query-client';
import { forbidsPage } from './query-errors';

describe('isPermissionError', () => {
  it('recognizes a GraphQL resolver denying permission', () => {
    const error = new GraphqlError({
      graphQLErrors: [{ message: '403: Permission Denied.' }],
    });
    expect(isPermissionError(error)).toBe(true);
  });

  it.each([
    'origin_not_allowed',
    'step_up_required',
    'back_office_identity_required',
  ])('leaves %s to its own error handling', (code) => {
    expect(isPermissionError(new ApiError(403, 'Forbidden', code))).toBe(false);
  });
});

describe('forbidsPage', () => {
  /** Runs one failing query and returns it as the shell finds it in the cache. */
  async function failed(error: Error, meta?: QueryMeta) {
    const client = new QueryClient();
    await client
      .fetchQuery({
        queryKey: ['admin', 'test'],
        queryFn: () => Promise.reject(error),
        retry: false,
        meta,
      })
      .catch(() => undefined);
    const query = client.getQueryCache().find({ queryKey: ['admin', 'test'] });
    if (!query) throw new Error('query missing from the cache');
    return query;
  }

  it('turns the page into the 403 page for a query that shows no error state of its own', async () => {
    expect(
      forbidsPage(await failed(new ApiError(403, 'Permission Denied.'))),
    ).toBe(true);
  });

  it('leaves the page alone for a silent query’s 403: its card or section shows it', async () => {
    expect(
      forbidsPage(
        await failed(new ApiError(403, 'Permission Denied.'), {
          [SILENT_ERROR_META]: true,
        }),
      ),
    ).toBe(false);
  });

  it('leaves the page alone for a failure that is not about permissions', async () => {
    expect(
      forbidsPage(await failed(new ApiError(500, 'Internal Server Error'))),
    ).toBe(false);
  });
});
